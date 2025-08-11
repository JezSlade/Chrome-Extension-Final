/*
  Content script: listens for keystrokes and performs Espanso-style expansions.
  Supports: input, textarea, and contenteditable. Skips password fields.
  Adds support for 'form' expansions with an inline shadow DOM modal.
*/

(function () {
  let expansions = [];
  let variables = [];
  let forms = [];
  let config = { enabled: true };

  function fmtDate(fmt) {
    try {
      const d = new Date();
      const pad = (n, w = 2) => String(n).padStart(w, "0");
      return (fmt || "%Y-%m-%d")
        .replace(/%Y/g, String(d.getFullYear()))
        .replace(/%m/g, pad(d.getMonth() + 1))
        .replace(/%d/g, pad(d.getDate()))
        .replace(/%H/g, pad(d.getHours()))
        .replace(/%M/g, pad(d.getMinutes()))
        .replace(/%S/g, pad(d.getSeconds()));
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function buildVarMap() {
    const map = {};
    for (const v of variables) {
      if (!v || !v.name) continue;
      if (v.type === "date") {
        map[v.name] = fmtDate(v.default || "%Y-%m-%d");
      } else {
        map[v.name] = v.default || "";
      }
    }
    // built-ins
    map.date = fmtDate("%Y-%m-%d");
    map.time = fmtDate("%H:%M:%S");
    return map;
  }

  function applyVars(text, extra = {}) {
    const map = { ...buildVarMap(), ...extra };
    return String(text || "").replace(/\{\{(\w+)\}\}/g, (_, k) => (k in map ? String(map[k]) : `{{${k}}}`));
  }

  function findMatch(word) {
    if (!word) return null;
    return expansions.find((e) => e.trigger === word);
  }

  function replaceInInput(el, from, to) {
    const start = el.selectionStart;
    const val = el.value;
    const before = val.slice(0, start);
    const idx = before.lastIndexOf(from);
    if (idx < 0) return;
    const newVal = val.slice(0, idx) + to + val.slice(start);
    const newCaret = idx + to.length;
    el.value = newVal;
    el.setSelectionRange(newCaret, newCaret);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function replaceInContentEditable(el, from, to) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    let node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) {
      if (node.childNodes && node.childNodes.length) {
        node = node.childNodes[Math.max(0, range.startOffset - 1)] || node.firstChild;
      }
    }
    if (!node || node.nodeType !== Node.TEXT_NODE) return;

    const text = node.nodeValue || "";
    const idx = text.lastIndexOf(from);
    if (idx < 0) return;
    const before = text.slice(0, idx);
    const after = text.slice(idx + from.length);
    node.nodeValue = before + to + after;
    const newOffset = (before + to).length;
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.setStart(node, newOffset);
    newRange.collapse(true);
    sel.addRange(newRange);
  }

  function getActiveWord(el) {
    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return "";
      const range = sel.getRangeAt(0).cloneRange();
      range.collapse(true);
      range.setStart(range.startContainer, Math.max(0, range.startOffset - 64));
      const snippet = String(range.toString());
      const m = snippet.match(/(:[^\s\n\t]{1,63})$/);
      return m ? m[1] : "";
    }
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      if (el.type && el.type.toLowerCase() === "password") return "";
      const start = el.selectionStart || 0;
      const val = el.value || "";
      const left = val.slice(0, start);
      const m = left.match(/(:[^\s\n\t]{1,63})$/);
      return m ? m[1] : "";
    }
    return "";
  }

  // -------- Form modal ----------
  function formModal(formDef, onSubmit, onCancel) {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial }
      .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 2147483647; }
      .card { width: min(560px, 96vw); background: #111827; color: #e5e7eb; border: 1px solid #374151; border-radius: 12px; padding: 14px; box-shadow: 0 12px 30px rgba(0,0,0,.45); font-family: system-ui, Segoe UI, Roboto, Arial, sans-serif; }
      .title { margin: 0 0 8px 0; font-size: 16px; }
      .lbl { font-size: 12px; color: #9ca3af; margin: 6px 0 4px 0; display: block; }
      .input { width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid #374151; background: #0b1220; color: #e5e7eb; }
      .area { min-height: 80px; }
      .row { display: flex; gap: 8px; align-items: center; justify-content: flex-end; margin-top: 12px; }
      .btn { border: 0; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
      .primary { background: #2563eb; color: white; }
      .ghost { background: #374151; color: #e5e7eb; }
      .grid { display: grid; gap: 10px; }
    `;

    const wrap = document.createElement("div");
    wrap.className = "backdrop";
    wrap.innerHTML = `
      <div class="card" role="dialog" aria-modal="true" aria-label="${escapeHtml(formDef.name || "Form")}">
        <h3 class="title">${escapeHtml(formDef.name || "Form")}</h3>
        <div class="grid" id="fields"></div>
        <div class="row">
          <button class="btn ghost" id="cancel" type="button">Cancel</button>
          <button class="btn primary" id="submit" type="button">Insert</button>
        </div>
      </div>
    `;

    shadow.append(style, wrap);
    document.documentElement.appendChild(host);

    const values = {};
    const fhost = shadow.getElementById("fields");
    const builtins = buildVarMap();

    for (const f of formDef.fields || []) {
      const label = document.createElement("label");
      label.className = "lbl";
      label.textContent = f.name;
      const input = f.type === "multiline" || f.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
      input.className = "input" + ((f.type === "multiline" || f.type === "textarea") ? " area" : "");
      input.value = applyVars(f.default || "", builtins);
      input.dataset.name = f.name;
      fhost.appendChild(label);
      fhost.appendChild(input);
    }

    function cleanup() {
      host.remove();
    }

    shadow.getElementById("cancel").addEventListener("click", () => {
      cleanup();
      onCancel && onCancel();
    });

    shadow.getElementById("submit").addEventListener("click", () => {
      (formDef.fields || []).forEach(f => {
        const el = Array.from(fhost.querySelectorAll(".input")).find(x => x.dataset.name === f.name);
        values[f.name] = el ? el.value : "";
      });
      cleanup();
      onSubmit && onSubmit(values);
    });

    // Close on Escape
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        cleanup();
        onCancel && onCancel();
      }
    }, { capture: true });

    // Focus first input
    const firstInput = fhost.querySelector(".input");
    if (firstInput) firstInput.focus();
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function handleKey(e) {
    if (!config.enabled) return;
    const target = e.target;
    if (!target) return;
    const isEditable = target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "INPUT";
    if (!isEditable) return;
    if (e.isComposing) return; // IME safe

    const triggerKeys = [" ", "Enter", "Tab", ",", ".", ";", ":", "!"];
    const shouldCheck = triggerKeys.includes(e.key) || e.type === "input";
    if (!shouldCheck) return;

    const word = getActiveWord(target);
    if (!word) return;
    const match = findMatch(word);
    if (!match) return;

    if (match.type === "form") {
      // Find form by id or use default embedded definition
      const form = (forms || []).find(f => String(f.id) === String(match.formId)) || match.form || null;
      if (!form) return;
      formModal(form, (values) => {
        const replacement = applyVars(form.template || "", values);
        if (target.isContentEditable) {
          replaceInContentEditable(target, match.trigger, replacement);
        } else {
          replaceInInput(target, match.trigger, replacement);
        }
      }, () => {});
      return;
    }

    const replacement = applyVars(match.replacement);
    if (target.isContentEditable) {
      replaceInContentEditable(target, match.trigger, replacement);
    } else {
      replaceInInput(target, match.trigger, replacement);
    }
  }

  function refresh() {
    chrome.storage.local.get(["expansions", "config", "variables", "forms"]).then((data) => {
      expansions = Array.isArray(data.expansions) ? data.expansions : [];
      config = data.config || { enabled: true };
      variables = Array.isArray(data.variables) ? data.variables : [];
      forms = Array.isArray(data.forms) ? data.forms : [];
    });
  }

  refresh();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.expansions || changes.config || changes.variables || changes.forms)) refresh();
  });

  document.addEventListener("keydown", handleKey, true);
  document.addEventListener("input", handleKey, true);
})();