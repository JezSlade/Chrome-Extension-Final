/*
  content/content.js - ToolForge v1.6.1
  Expands triggers and resolves advanced template variables.
*/
(function(){
  let expansions = [];
  let variables = [];
  let enabled = true;
  let lastMatchGroups = [];
  function pad(n){ return String(n).padStart(2, "0"); }
  function formatDate(fmt, d = new Date()){
    return fmt
      .replace(/%Y/g, String(d.getFullYear()))
      .replace(/%m/g, pad(d.getMonth()+1))
      .replace(/%d/g, pad(d.getDate()))
      .replace(/%H/g, pad(d.getHours()))
      .replace(/%M/g, pad(d.getMinutes()))
      .replace(/%S/g, pad(d.getSeconds()));
  }
  function computeVar(v){
    if (!v) return "";
    if (v.type === "formatDate") return formatDate(v.default || "%Y-%m-%d");
    return v.default || "";
  }
  function isEditable(el){
    if (!el) return false;
    const tag = (el.tagName||"").toLowerCase();
    if (tag === "textarea") return true;
    if (tag === "input"){
      const type = (el.type||"").toLowerCase();
      if (type === "password" || type === "file") return false;
      return true;
    }
    return !!el.isContentEditable;
  }
  async function refreshState(){
    try {
      const res = await chrome.runtime.sendMessage({ type: "GET_STATE" });
      if (res && res.ok){
        expansions = res.data.expansions||[];
        variables = res.data.variables||[];
        enabled = !!(res.data.config && res.data.config.enabled);
      }
    } catch {}
  }
  function findTriggerWithContext(text){
    let found = null;
    let foundMatch = null;
    for (const e of expansions){
      const typ = e.type || "text";
      if (typ === "regex" && e.pattern){
        try{
          const re = new RegExp(e.pattern, "m");
          const m = text.match(re);
          if (m && m.index + m[0].length === text.length){
            if (!found || (m[0].length > (foundMatch ? foundMatch[0].length : (found && found.trigger ? found.trigger.length : 0)))){
              found = e;
              foundMatch = m;
            }
          }
        } catch {}
        continue;
      }
      const t = e.trigger || "";
      if (t && text.endsWith(t)){
        if (!found || t.length > (found.trigger||"").length){
          found = e;
          foundMatch = null;
        }
      }
    }
    return { exp: found, match: foundMatch };
  }
  async function renderTemplateAsync(template, ctx){
    if (!template) return { text: "", cursorIndex: -1 };
    template = await applyConditionals(template, ctx);
    const tokenRe = /{{\s*([^}]+?)\s*}}/g;
    let out = "";
    let lastIndex = 0;
    let cursorIndex = -1;
    for (let m; (m = tokenRe.exec(template)); ){
      out += template.slice(lastIndex, m.index);
      lastIndex = m.index + m[0].length;
      const token = m[1];
      if (token === "cursor"){ cursorIndex = out.length; continue; }
      const cap = token.match(/^match_(\d+)$/);
      if (cap){
        const idx = parseInt(cap[1], 10);
        out += (ctx.matchGroups && ctx.matchGroups[idx]) || "";
        continue;
      }
      if (token.startsWith("date:") || token.startsWith("time:")){
        const fmt = token.split(":").slice(1).join(":");
        const realFmt = fmt.startsWith("+") ? fmt.slice(1) : fmt;
        out += formatDate(realFmt);
        continue;
      }
      if (token === "clipboard"){
        out += await safeReadClipboard();
        continue;
      }
      const envMatch = token.match(/^env\.([A-Za-z0-9_]+)$/);
      if (envMatch){
        out += await getEnvValue(envMatch[1]);
        continue;
      }
      const outMatch = token.match(/^output:(.+)$/);
      if (outMatch){
        out += await runOutputCommand(outMatch[1].trim());
        continue;
      }
      const inpMatch = token.match(/^input:(.+)$/);
      if (inpMatch){
        const label = inpMatch[1].trim();
        const val = window.prompt(label || "Input");
        out += val != null ? String(val) : "";
        continue;
      }
      if (token === "uuid"){
        out += genUUID();
        continue;
      }
      const v = variables.find(vv => vv && vv.name === token);
      if (v){
        out += String(await resolveLibraryVar(v, ctx));
        continue;
      }
      out += m[0];
    }
    out += template.slice(lastIndex);
    return { text: out, cursorIndex };
  }
  async function applyConditionals(text, ctx){
    const re = /{{\s*if\s+([A-Za-z0-9_.]+)\s*}}([\s\S]*?){{\s*endif\s*}}/g;
    return text.replace(re, function(_full, name, body){
      let truthy = "";
      const lib = variables.find(v => v && v.name === name);
      if (lib){ truthy = computeVar(lib); }
      else if (name.startsWith("env.")){ truthy = (ctx.env && ctx.env[name.slice(4)]) || ""; }
      else if (name.startsWith("match_")){
        const idx = parseInt(name.slice(6), 10);
        truthy = (ctx.matchGroups && ctx.matchGroups[idx]) || "";
      }
      return truthy ? body : "";
    });
  }
  async function resolveLibraryVar(v, _ctx){
    if (v.type === "formatDate") return formatDate(v.default || "%Y-%m-%d");
    if (v.type === "select"){
      const opts = Array.isArray(v.options) ? v.options : [];
      if (v.default != null && v.default !== "") return String(v.default);
      return String(opts[0] || "");
    }
    return v.default != null ? String(v.default) : "";
  }
  async function safeReadClipboard(){
    try {
      if (navigator.clipboard && navigator.clipboard.readText){
        return await navigator.clipboard.readText();
      }
    } catch {}
    return "";
  }
  async function getEnvValue(key){
    try{
      const res = await chrome.runtime.sendMessage({ type: "GET_STATE" });
      const env = (res && res.ok && res.data && res.data.config && res.data.config.env) || {};
      if (Object.prototype.hasOwnProperty.call(env, key)) return String(env[key] ?? "");
    } catch {}
    return "";
  }
  async function runOutputCommand(cmd){
    switch (cmd){
      case "url": return String(location.href || "");
      case "title": return String(document.title || "");
      case "selection": {
        const sel = window.getSelection && window.getSelection();
        return sel ? String(sel.toString() || "") : "";
      }
      case "ua": return String(navigator.userAgent || "");
      case "hostname": return String(location.hostname || "");
      case "path": return String(location.pathname || "");
      case "ls": {
        const inputs = Array.from(document.querySelectorAll("input, textarea, select"));
        return inputs.map((el, i) => (el.name || el.id || el.tagName.toLowerCase()) + "#" + i).join(", ");
      }
      default: return "";
    }
  }
  function genUUID(){
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = [...b].map(x => x.toString(16).padStart(2, "0"));
    return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
  }
  function insertTextAtCaret(editable, text, cursorIndex){
    if (editable.value != null){
      const start = editable.selectionStart ?? editable.value.length;
      const end = editable.selectionEnd ?? editable.value.length;
      const before = editable.value.slice(0, start);
      const after = editable.value.slice(end);
      const hasCursor = typeof cursorIndex === "number" && cursorIndex >= 0 && cursorIndex <= text.length;
      const caretPos = before.length + (hasCursor ? cursorIndex : text.length);
      editable.value = before + text + after;
      try { editable.setSelectionRange(caretPos, caretPos); } catch {}
      editable.dispatchEvent(new Event("input", { bubbles: true }));
      editable.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.rangeCount === 0){
      editable.textContent += text;
      return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    if (typeof cursorIndex === "number" && cursorIndex >= 0 && cursorIndex <= text.length){
      const before = document.createTextNode(text.slice(0, cursorIndex));
      const after = document.createTextNode(text.slice(cursorIndex));
      range.insertNode(after);
      range.insertNode(before);
      sel.removeAllRanges();
      const newRange = document.createRange();
      newRange.setStartAfter(before);
      newRange.collapse(true);
      sel.addRange(newRange);
    } else {
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  async function handleExpansionAsync(el, value, exp, match){
    if (el.value != null){
      const t = el.value;
      let idx = -1, cutLen = 0;
      if (match){
        idx = t.lastIndexOf(match[0]);
        cutLen = match[0].length;
        lastMatchGroups = Array.from(match);
      } else {
        idx = t.lastIndexOf(exp.trigger);
        cutLen = exp.trigger.length;
        lastMatchGroups = [];
      }
      if (idx < 0) return;
      const before = t.slice(0, idx);
      const after = t.slice(idx + cutLen);
      const ctx = { matchGroups: lastMatchGroups, env: null };
      const rendered = await renderTemplateAsync(exp.replacement || "", ctx);
      el.value = before + rendered.text + after;
      const caret = before.length + (typeof rendered.cursorIndex === "number" && rendered.cursorIndex >= 0 ? rendered.cursorIndex : rendered.text.length);
      try { el.setSelectionRange(caret, caret); } catch {}
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    const t = el.textContent || "";
    let idx2 = -1, cutLen2 = 0;
    if (match){
      idx2 = t.lastIndexOf(match[0]);
      cutLen2 = match[0].length;
      lastMatchGroups = Array.from(match);
    } else {
      idx2 = t.lastIndexOf(exp.trigger);
      cutLen2 = exp.trigger.length;
      lastMatchGroups = [];
    }
    if (idx2 < 0) return;
    const before2 = t.slice(0, idx2);
    const after2 = t.slice(idx2 + cutLen2);
    const ctx2 = { matchGroups: lastMatchGroups, env: null };
    const rendered2 = await renderTemplateAsync(exp.replacement || "", ctx2);
    el.textContent = before2 + rendered2.text + after2;
    const sel = window.getSelection && window.getSelection();
    if (sel){
      sel.removeAllRanges();
      const range = document.createRange();
      const node = el.firstChild;
      if (node && node.nodeType === Node.TEXT_NODE){
        const offset = (before2 + rendered2.text).length;
        range.setStart(node, Math.min(offset, node.textContent.length));
      } else {
        range.selectNodeContents(el);
        range.collapse(false);
      }
      sel.addRange(range);
    }
  }
  function handleKey(e){
    if (!enabled) return;
    const el = e.target;
    if (!isEditable(el)) return;
    const value = (el.value != null) ? el.value : el.textContent || "";
    const found = findTriggerWithContext(value);
    const exp = found.exp;
    if (!exp) return;
    if (e.key === " " || e.key === "Enter" || e.key === "Tab"){
      Promise.resolve().then(() => handleExpansionAsync(el, value, exp, found.match));
    }
  }
  function handleFocus(){ refreshState(); }
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      if (!msg) return;
      if (msg.type === "INSERT_TEXT"){
        const el = document.activeElement;
        if (!isEditable(el)) return sendResponse && sendResponse({ ok:false, error:"No editable element focused" });
        const raw = String(msg.text || "");
        if (raw.includes("{{") && raw.includes("}}")){
          const rendered = await renderTemplateAsync(raw, { matchGroups: [], env: null });
          insertTextAtCaret(el, rendered.text, rendered.cursorIndex);
        } else {
          insertTextAtCaret(el, raw, -1);
        }
        sendResponse && sendResponse({ ok:true });
        return;
      }
      if (msg.type === "APPLY_TEMPLATE"){
        const el = document.activeElement;
        if (!isEditable(el)) return sendResponse && sendResponse({ ok:false, error:"No editable element focused" });
        const rendered = await renderTemplateAsync(String(msg.template || ""), { matchGroups: [], env: null });
        insertTextAtCaret(el, rendered.text, rendered.cursorIndex);
        sendResponse && sendResponse({ ok:true });
        return;
      }
    })();
    return true;
  });
  document.addEventListener("keydown", handleKey, true);
  document.addEventListener("focusin", handleFocus, true);
  refreshState();
})();