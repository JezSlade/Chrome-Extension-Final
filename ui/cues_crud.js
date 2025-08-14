import { loadState, saveState } from "./common.js";
import { uuid } from "../js/utils.js";

let STATE = null;

function renderList() {
  const tbody = document.querySelector("#table tbody"); tbody.innerHTML = "";
  for (const c of STATE.cues || []) {
    const tr = document.createElement("tr");

    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = c.enabled !== false;
    cb.addEventListener("change", async () => updateCue(c.id, { enabled: cb.checked }));

    const t = document.createElement("input"); t.type = "text"; t.value = c.trigger;
    t.addEventListener("change", async () => {
      if ((STATE.cues || []).some(x => x.id !== c.id && x.trigger === t.value)) { alert("Trigger must be unique"); t.value = c.trigger; return; }
      await updateCue(c.id, { trigger: t.value });
    });

    const preview = document.createElement("div");
    preview.className = "note";
    preview.textContent = c.template.length > 90 ? c.template.slice(0, 90) + " ..." : c.template;
    const open = document.createElement("button"); open.textContent = "Edit";
    open.addEventListener("click", () => openCueWizard("edit", c));

    const del = document.createElement("button"); del.textContent = "Delete";
    del.addEventListener("click", async () => {
      const next = { ...STATE, cues: (STATE.cues || []).filter(x => x.id !== c.id), _meta: { ...(STATE._meta||{}), updatedAt: Date.now() } };
      await saveState(next); STATE = next; renderList();
    });

    const td0 = document.createElement("td"); td0.appendChild(cb);
    const td1 = document.createElement("td"); td1.appendChild(t);
    const td2 = document.createElement("td"); td2.appendChild(preview); td2.appendChild(document.createElement("br")); td2.appendChild(open);
    const td3 = document.createElement("td"); td3.appendChild(del);
    tr.append(td0, td1, td2, td3);
    tbody.appendChild(tr);
  }
}

function buildCueStep1(draft) {
  return `
    <div class="field">
      <label>Trigger</label>
      <input id="tplTrigger" name="tplTrigger" type="text" placeholder=":shortcut" value="${draft.trigger || ""}">
    </div>
  `;
}
function buildCueStep2(draft) {
  // Template editor with toolbar and variable pills
  const pills = (STATE.variables || []).map(v => `<span class="pill" data-insert="{{${v.id}}}" title="Insert {{${v.id}}}">${v.id}</span>`).join("");
  const val = draft.template || "";
  return `
    <div class="field">
      <label>Template</label>
      <div class="toolbar">
        <button type="button" data-md="**">Bold</button>
        <button type="button" data-md="_">Italic</button>
        <button type="button" data-md="\`">Code</button>
        <button type="button" data-insert="{{date:%Y-%m-%d}}">Insert {{date}}</button>
        <button type="button" data-insert="{{time:%H:%M}}">Insert {{time}}</button>
      </div>
      <textarea id="tplArea" name="tplArea" rows="12" spellcheck="false">${val}</textarea>
    </div>
    <div class="field">
      <label>Variables</label>
      <div id="varPills">${pills}</div>
    </div>
  `;
}
function fmt(fmtStr) {
  const d = new Date();
  const pad = (n,w=2)=>String(n).padStart(w,"0");
  return fmtStr.replace(/%Y/g,String(d.getFullYear()))
               .replace(/%m/g,pad(d.getMonth()+1))
               .replace(/%d/g,pad(d.getDate()))
               .replace(/%H/g,pad(d.getHours()))
               .replace(/%M/g,pad(d.getMinutes()))
               .replace(/%S/g,pad(d.getSeconds()));
}
function previewRender(tpl, vars) {
  return tpl.replace(/\{\{([^}]+)\}\}/g, (m, key) => {
    const [name, param] = String(key).split(":", 2);
    if (name === "date") return fmt(param || vars?.date?.default || "%Y-%m-%d");
    if (name === "time") return fmt(param || vars?.time?.default || "%H:%M");
    const v = vars?.[name];
    if (!v) return "";
    if (v.type === "date") return fmt(typeof v.default === "string" ? v.default : "%Y-%m-%d");
    if (v.type === "time") return fmt(typeof v.default === "string" ? v.default : "%H:%M");
    if (v.type === "datetime") return fmt(typeof v.default === "string" ? v.default : "%Y-%m-%d %H:%M");
    if (Array.isArray(v.default)) return v.default.join(", ");
    if (typeof v.default === "boolean") return v.default ? "true" : "false";
    return String(v.default ?? "");
  });
}
function openCueWizard(mode, c) {
  const draft = { id: c?.id, trigger: c?.trigger || "", template: c?.template || "", enabled: c?.enabled !== false };

  const wizard = new window.StepFormWizardModal({
    containerId: "cueWizardContainer",
    title: mode === "edit" ? "Edit Cue" : "Create Cue",
    steps: [
      { title: "Basic", content: buildCueStep1(draft) },
      { title: "Template", content: buildCueStep2(draft) },
      { title: "Review", content: `<div class="note" id="tpl_review">Review will appear here.</div>` }
    ],
    onValidate: (stepIndex) => {
      if (stepIndex === 0) {
        const trig = String(document.getElementById("tplTrigger")?.value || "").trim();
        if (!trig) return false;
        if ((STATE.cues || []).some(x => x.trigger === trig && x.id !== draft.id)) { alert("Trigger must be unique"); return false; }
        return true;
      }
      return true;
    },
    onStepChange: (to) => {
      if (to === 1) {
        wireCueToolbar();
      }
      if (to === 2) {
        const trig = String(document.getElementById("tplTrigger")?.value || "").trim();
        const tpl = String(document.getElementById("tplArea")?.value || "");
        const vars = {};
        for (const v of (STATE.variables || [])) vars[v.id] = v;
        document.getElementById("tpl_review").textContent = `Trigger: ${trig} | Preview: ${previewRender(tpl, vars)}`;
      }
    },
    onComplete: async (formData) => {
      const trig = String(formData.tplTrigger || "").trim();
      const tpl = String(formData.tplArea || "");
      if (!trig) { alert("Trigger required"); return; }
      if ((STATE.cues || []).some(x => x.trigger === trig && x.id !== draft.id)) { alert("Trigger must be unique"); return; }

      const next = { ...STATE };
      next.cues = [...(STATE.cues || [])];
      if (mode === "edit" && draft.id) {
        const idx = next.cues.findIndex(x => x.id === draft.id);
        if (idx >= 0) next.cues[idx] = { ...next.cues[idx], trigger: trig, template: tpl };
      } else {
        next.cues.push({ id: uuid(), trigger: trig, template: tpl, enabled: true });
      }
      next._meta = { ...(next._meta || {}), updatedAt: Date.now() };
      await saveState(next); STATE = next; renderList();
    }
  });

  wizard.open({
    tplTrigger: draft.trigger,
    tplArea: draft.template
  });

  function wireCueToolbar() {
    // formatting buttons
    document.querySelectorAll('.toolbar button[data-md]').forEach(btn => {
      btn.onclick = () => {
        const ta = document.getElementById('tplArea');
        if (!ta) return;
        const token = btn.getAttribute('data-md');
        const start = ta.selectionStart ?? 0;
        const end = ta.selectionEnd ?? start;
        const txt = ta.value;
        const sel = txt.slice(start, end);
        const wrapped = `${token}${sel}${token}`;
        ta.value = txt.slice(0, start) + wrapped + txt.slice(end);
        const pos = start + wrapped.length;
        ta.setSelectionRange(pos, pos);
        ta.focus();
      };
    });
    // variable and date/time insert
    document.querySelectorAll('[data-insert]').forEach(el => {
      el.onclick = () => {
        const token = el.getAttribute('data-insert');
        const ta = document.getElementById('tplArea');
        if (!ta) return;
        const start = ta.selectionStart ?? 0;
        const end = ta.selectionEnd ?? start;
        const txt = ta.value;
        ta.value = txt.slice(0, start) + token + txt.slice(end);
        const pos = start + token.length;
        ta.setSelectionRange(pos, pos);
        ta.focus();
      };
    });
  }
}

async function updateCue(id, patch) {
  const idx = (STATE.cues || []).findIndex(x => x.id === id);
  if (idx < 0) return;
  const next = { ...STATE };
  next.cues = [...STATE.cues];
  next.cues[idx] = { ...next.cues[idx], ...patch };
  next._meta = { ...(next._meta || {}), updatedAt: Date.now() };
  await saveState(next); STATE = next; renderList();
}

async function boot() {
  STATE = await loadState();

  document.getElementById("add").addEventListener("click", () => openCueWizard("create", null));

  // deep link open from library hash
  if (location.hash.startsWith("#edit=")) {
    const id = decodeURIComponent(location.hash.slice("#edit=".length));
    const cue = (STATE.cues || []).find(c => c.id === id);
    if (cue) openCueWizard("edit", cue);
    history.replaceState(null, "", location.pathname);
  }

  renderList();
}
boot().catch(e => alert(String(e)));
