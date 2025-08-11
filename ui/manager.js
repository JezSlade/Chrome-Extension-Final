(function () {
  // Utilities
  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

  function notify(msg) {
    const box = document.createElement("div");
    box.className = "notice";
    box.textContent = msg;
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add("show"));
    setTimeout(() => { box.classList.remove("show"); setTimeout(() => box.remove(), 220); }, 2200);
  }

  function fmtDate(fmt) {
    const d = new Date();
    const pad = (n, w = 2) => String(n).padStart(w, "0");
    return (fmt || "%Y-%m-%d").replace(/%Y/g, String(d.getFullYear())).replace(/%m/g, pad(d.getMonth() + 1)).replace(/%d/g, pad(d.getDate())).replace(/%H/g, pad(d.getHours())).replace(/%M/g, pad(d.getMinutes())).replace(/%S/g, pad(d.getSeconds()));
  }

  function buildVarMap(vars) {
    const map = {};
    for (const v of vars) {
      if (!v || !v.name) continue;
      if (v.type === "date") map[v.name] = fmtDate(v.default || "%Y-%m-%d");
      else map[v.name] = v.default || "";
    }
    map.date = fmtDate("%Y-%m-%d");
    map.time = fmtDate("%H:%M:%S");
    return map;
  }

  function applyVars(text, varMap) {
    const map = varMap || {};
    return String(text || "").replace(/\{\{(\w+)\}\}/g, (_, k) => (k in map ? String(map[k]) : `{{${k}}}`));
  }

  // State
  const state = {
    activeTab: "composer",
    expansions: [],
    forms: [],
    variables: [],
    config: {},
    currentExpansion: { trigger: "", type: "text", replacement: "", category: "", notes: "", formId: "" },
    selectedFormId: null
  };

  // Storage helpers
  async function loadAll() {
    const res = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    const data = res?.data || {};
    state.expansions = Array.isArray(data.expansions) ? data.expansions : [];
    state.forms = Array.isArray(data.forms) ? data.forms : [];
    state.variables = Array.isArray(data.variables) ? data.variables : [];
    state.config = data.config || {};
    updateCounts();
  }

  function persist(partial = {}) {
    const payload = {
      expansions: state.expansions,
      forms: state.forms,
      variables: state.variables,
      config: state.config,
      ...partial
    };
    chrome.runtime.sendMessage({ type: "SET_STATE", payload });
    updateCounts();
  }

  function updateCounts() {
    const txt = `Expansions: ${state.expansions.length} • Forms: ${state.forms.length} • Vars: ${state.variables.length}`;
    const el = qs("#statusCounts");
    if (el) el.textContent = txt;
  }

  // Tabs
  function setPanel(id) {
    state.activeTab = id;
    qsa(".panel").forEach(p => p.classList.toggle("active", p.getAttribute("data-panel") === id));
    qsa(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === id));
    const title = {
      composer: "Expansions",
      forms: "Forms",
      variables: "Variables",
      library: "Library",
      config: "Configuration",
      "import-export": "Import or Export"
    }[id] || "Dashboard";
    qs("#panelTitle").textContent = title;
  }

  // Render - Expansions
  function renderExpansions() {
    // Fill form select in expansion editor
    const formSel = qs("#expFormId");
    formSel.innerHTML = "";
    for (const f of state.forms) {
      const opt = document.createElement("option");
      opt.value = String(f.id);
      opt.textContent = f.name || `Form ${f.id}`;
      formSel.appendChild(opt);
    }

    const list = qs("#expansionList");
    list.innerHTML = "";

    const q = (qs("#search").value || "").toLowerCase();
    const items = state.expansions.filter(x =>
      !q || x.trigger.toLowerCase().includes(q) || (x.category || "").toLowerCase().includes(q)
    );

    for (const e of items) {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div>
          <div class="title">${e.trigger} <span class="muted">${e.type}${e.category ? " • " + e.category : ""}</span></div>
          <div class="muted">${e.type === "form" ? `Form: ${getFormName(e.formId)}` : (e.replacement || "").slice(0, 80)}</div>
        </div>
        <div class="actions">
          <button class="btn small" data-act="edit">Edit</button>
          <button class="btn small" data-act="delete">Delete</button>
        </div>`;
      row.querySelector('[data-act="edit"]').addEventListener('click', () => editExpansion(e.id));
      row.querySelector('[data-act="delete"]').addEventListener('click', () => deleteExpansion(e.id));
      list.appendChild(row);
    }
  }

  function getFormName(id) {
    const f = state.forms.find(x => String(x.id) === String(id));
    return f ? (f.name || `Form ${f.id}`) : "Unknown";
  }

  function editExpansion(id) {
    const e = state.expansions.find(x => x.id === id);
    if (!e) return;
    state.currentExpansion = { ...e };
    qs("#expTrigger").value = e.trigger || "";
    qs("#expType").value = e.type || "text";
    qs("#expCategory").value = e.category || "";
    qs("#expNotes").value = e.notes || "";
    if (e.type === "form") {
      toggleExpEditMode("form");
      qs("#expFormId").value = String(e.formId || "");
    } else {
      toggleExpEditMode("text");
      qs("#expReplacement").value = e.replacement || "";
    }
    updatePreview();
  }

  function deleteExpansion(id) {
    state.expansions = state.expansions.filter(x => x.id !== id);
    persist();
    renderExpansions();
    notify("Expansion deleted");
  }

  function toggleExpEditMode(kind) {
    const textBox = qs("#expTextBox");
    const formBox = qs("#expFormBox");
    const isForm = kind === "form";
    textBox.classList.toggle("hide", isForm);
    formBox.classList.toggle("hide", !isForm);
  }

  function saveExpansion() {
    const trigger = qs("#expTrigger").value.trim();
    const type = qs("#expType").value;
    const category = qs("#expCategory").value;
    const notes = qs("#expNotes").value;
    if (!trigger) { notify("Trigger required"); return; }

    let next = { id: state.currentExpansion.id || Date.now(), trigger, type, category, notes };
    if (type === "form") {
      next.formId = qs("#expFormId").value || "";
      if (!next.formId) { notify("Pick a form"); return; }
    } else {
      next.replacement = qs("#expReplacement").value || "";
      if (!next.replacement) { notify("Replacement required"); return; }
    }

    const i = state.expansions.findIndex(x => x.id === next.id);
    if (i >= 0) state.expansions[i] = next; else state.expansions.push(next);
    state.currentExpansion = { trigger: "", type: "text", replacement: "", category: "", notes: "", formId: "" };
    qs("#expTrigger").value = "";
    qs("#expReplacement").value = "";
    qs("#expCategory").value = "";
    qs("#expNotes").value = "";
    qs("#expType").value = "text";
    persist();
    renderExpansions();
    updatePreview();
    notify("Expansion saved");
  }

  function updatePreview() {
    const trig = qs("#expTrigger").value || ":trigger";
    const type = qs("#expType").value;
    const varMap = buildVarMap(state.variables);

    qs("#previewTrigger").textContent = trig;
    if (type === "form") {
      const formId = qs("#expFormId").value;
      const form = state.forms.find(f => String(f.id) === String(formId));
      const fakeValues = {};
      (form?.fields || []).forEach(f => fakeValues[f.name] = applyVars(f.default || "", varMap));
      qs("#previewText").textContent = applyVars(form?.template || "", { ...varMap, ...fakeValues });
    } else {
      const text = qs("#expReplacement").value || "";
      qs("#previewText").textContent = applyVars(text, varMap);
    }
  }

  // Render - Forms
  function renderForms() {
    const list = qs("#formsList");
    list.innerHTML = "";
    const q = (qs("#search").value || "").toLowerCase();
    for (const f of state.forms.filter(x => !q || (x.name || "").toLowerCase().includes(q))) {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div>
          <div class="title">${f.name || `Form ${f.id}`}</div>
          <div class="muted">Fields: ${(f.fields || []).length}</div>
        </div>
        <div class="actions">
          <button class="btn small" data-act="select">Select</button>
        </div>`;
      row.querySelector('[data-act="select"]').addEventListener('click', () => selectForm(f.id));
      list.appendChild(row);
    }

    // If nothing selected, pick first
    if (!state.selectedFormId && state.forms[0]) selectForm(state.forms[0].id);
  }

  function selectForm(id) {
    state.selectedFormId = id;
    const f = state.forms.find(x => x.id === id);
    if (!f) return;
    qs("#formName").value = f.name || "";
    qs("#formTemplate").value = f.template || "";
    renderFormFields(f);
  }

  function renderFormFields(form) {
    const host = qs("#fieldsList");
    host.innerHTML = "";
    for (const fld of form.fields || []) {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div>
          <div class="title">${fld.name} <span class="muted">${fld.type}</span></div>
          <div class="muted">Default: ${(fld.default || "").slice(0, 80)}</div>
        </div>
        <div class="actions">
          <button class="btn small" data-act="edit">Edit</button>
          <button class="btn small" data-act="delete">Delete</button>
        </div>`;
      row.querySelector('[data-act="edit"]').addEventListener('click', () => editField(form.id, fld.id));
      row.querySelector('[data-act="delete"]').addEventListener('click', () => deleteField(form.id, fld.id));
      host.appendChild(row);
    }
  }

  function editField(formId, fieldId) {
    const form = state.forms.find(f => f.id === formId);
    if (!form) return;
    const fld = form.fields.find(x => x.id === fieldId);
    if (!fld) return;

    const name = prompt("Field name", fld.name) || fld.name;
    const type = prompt("Field type (text, textarea, multiline)", fld.type) || fld.type;
    const def = prompt("Default value", fld.default || "") || fld.default || "";

    fld.name = name;
    fld.type = type;
    fld.default = def;
    persist();
    selectForm(formId);
    notify("Field updated");
  }

  function deleteField(formId, fieldId) {
    const form = state.forms.find(f => f.id === formId);
    if (!form) return;
    form.fields = (form.fields || []).filter(x => x.id !== fieldId);
    persist();
    selectForm(formId);
  }

  function addForm() {
    const f = { id: Date.now(), name: "New Form", template: "", fields: [] };
    state.forms.push(f);
    persist();
    renderForms();
    selectForm(f.id);
  }

  function dupForm() {
    const form = state.forms.find(f => f.id === state.selectedFormId);
    if (!form) { notify("Pick a form"); return; }
    const copy = JSON.parse(JSON.stringify(form));
    copy.id = Date.now();
    copy.name = `${form.name || "Form"} Copy`;
    copy.fields.forEach(f => f.id = Date.now() + Math.floor(Math.random() * 10000));
    state.forms.push(copy);
    persist();
    renderForms();
    selectForm(copy.id);
    notify("Form duplicated");
  }

  function delForm() {
    if (!state.selectedFormId) return;
    const id = state.selectedFormId;
    state.forms = state.forms.filter(f => f.id !== id);
    // Remove any expansions that pointed at this form to avoid orphans
    state.expansions = state.expansions.map(e => (e.type === "form" && String(e.formId) === String(id)) ? { ...e, formId: "" } : e);
    state.selectedFormId = null;
    persist();
    renderForms();
    renderExpansions();
  }

  function addField() {
    const form = state.forms.find(f => f.id === state.selectedFormId);
    if (!form) { notify("Pick a form"); return; }
    form.fields = form.fields || [];
    form.fields.push({ id: Date.now(), name: "field", type: "text", default: "" });
    persist();
    selectForm(form.id);
  }

  function addFieldFromVar() {
    const form = state.forms.find(f => f.id === state.selectedFormId);
    if (!form) { notify("Pick a form"); return; }
    const names = state.variables.map(v => v.name).join(", ");
    const name = prompt(`Variable to add as field. Available: ${names}`);
    if (!name) return;
    const v = state.variables.find(x => x.name === name);
    if (!v) { notify("No such variable"); return; }
    form.fields.push({ id: Date.now(), name: v.name, type: v.type === "multiline" ? "multiline" : "text", default: v.default || "" });
    persist();
    selectForm(form.id);
  }

  function saveForm() {
    const form = state.forms.find(f => f.id === state.selectedFormId);
    if (!form) { notify("Pick a form"); return; }
    form.name = qs("#formName").value || form.name;
    form.template = qs("#formTemplate").value || form.template;
    persist();
    renderForms();
    notify("Form saved");
  }

  // Render - Variables
  function renderVariables() {
    const host = qs("#variablesList");
    host.innerHTML = "";

    const q = (qs("#search").value || "").toLowerCase();
    for (const v of state.variables.filter(x => !q || (x.name || "").toLowerCase().includes(q))) {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div>
          <div class="title">${v.name} <span class="muted">${v.type}</span></div>
          <div class="muted">Default: ${(v.default || "").slice(0, 80)}</div>
        </div>
        <div class="actions">
          <button class="btn small" data-act="edit">Edit</button>
          <button class="btn small" data-act="delete">Delete</button>
        </div>`;
      row.querySelector('[data-act="edit"]').addEventListener('click', () => editVariable(v.id));
      row.querySelector('[data-act="delete"]').addEventListener('click', () => deleteVariable(v.id));
      host.appendChild(row);
    }
  }

  function addVariable() {
    state.variables.push({ id: Date.now(), name: "var", type: "text", default: "" });
    persist();
    renderVariables();
  }

  function editVariable(id) {
    const v = state.variables.find(x => x.id === id);
    if (!v) return;
    const name = prompt("Variable name", v.name) || v.name;
    const type = prompt("Variable type (text, choice, date, shell)", v.type) || v.type;
    const def = prompt("Default value", v.default || "") || v.default || "";
    v.name = name;
    v.type = type;
    v.default = def;
    persist();
    renderVariables();
  }

  function deleteVariable(id) {
    state.variables = state.variables.filter(x => x.id !== id);
    persist();
    renderVariables();
  }

  // Library
  function renderLibrary() {
    const libE = qs("#libExpansions");
    const libF = qs("#libForms");
    const libV = qs("#libVariables");
    libE.innerHTML = libF.innerHTML = libV.innerHTML = "";

    for (const e of state.expansions) {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `<div><div class="title">${e.trigger}</div><div class="muted">${e.type === "form" ? `Form ${getFormName(e.formId)}` : (e.replacement || "").slice(0, 80)}</div></div>`;
      libE.appendChild(el);
    }

    for (const f of state.forms) {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `<div><div class="title">${f.name}</div><div class="muted">Fields: ${(f.fields || []).length}</div></div>`;
      libF.appendChild(el);
    }

    for (const v of state.variables) {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `<div><div class="title">${v.name}</div><div class="muted">${v.type}</div></div>`;
      libV.appendChild(el);
    }
  }

  // Config
  function saveConfig() {
    state.config.auto_restart = qs("#cfgAutoRestart").checked;
    state.config.show_notifications = qs("#cfgShowNotifications").checked;
    state.config.toggle_key = qs("#cfgToggleKey").value || "ALT+SPACE";
    state.config.backend = qs("#cfgBackend").value || "Auto";
    state.config.clipboard_threshold = Number(qs("#cfgClipboardThreshold").value || 100);
    persist();
    notify("Config saved");
  }

  function populateConfigGUI() {
    qs("#cfgAutoRestart").checked = !!state.config.auto_restart;
    qs("#cfgShowNotifications").checked = !!state.config.show_notifications;
    qs("#cfgToggleKey").value = state.config.toggle_key || "ALT+SPACE";
    qs("#cfgBackend").value = state.config.backend || "Auto";
    qs("#cfgClipboardThreshold").value = Number(state.config.clipboard_threshold || 100);
  }

  // Import Export
  function toYAML(obj) {
    let yaml = "";
    for (const [key, value] of Object.entries(obj)) {
      yaml += `${key}:\n`;
      if (Array.isArray(value)) {
        for (const item of value) {
          yaml += `  - `;
          if (typeof item === "object" && item !== null) {
            const pairs = Object.entries(item).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n    ");
            yaml += pairs + "\n    ";
          } else {
            yaml += JSON.stringify(item) + "\n";
          }
        }
      } else if (typeof value === "object" && value !== null) {
        for (const [k, v] of Object.entries(value)) {
          yaml += `  ${k}: ${JSON.stringify(v)}\n`;
        }
      }
      yaml += "\n";
    }
    return yaml;
  }

  function exportData(kind, format) {
    let data = {};
    switch (kind) {
      case "expansions": data = { expansions: state.expansions }; break;
      case "forms": data = { forms: state.forms }; break;
      case "variables": data = { variables: state.variables }; break;
      case "config": data = { config: state.config }; break;
      case "all": data = { expansions: state.expansions, forms: state.forms, variables: state.variables, config: state.config }; break;
    }
    const filename = `mat-backup-${kind}-${new Date().toISOString().slice(0,10)}.${format}`;
    const content = format === "yaml" ? toYAML(data) : JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    notify("Exported");
  }

  function importData(file, kind) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        let data;
        if (file.name.endsWith(".json")) {
          data = JSON.parse(text);
        } else {
          // naive YAML
          const lines = text.split(/\r?\n/);
          const top = {};
          let currentKey = null;
          let currentArr = null;
          for (const line of lines) {
            const m = line.match(/^(\w+):\s*$/);
            if (m) { currentKey = m[1]; top[currentKey] = []; currentArr = top[currentKey]; continue; }
            const kv = line.match(/^\s*-\s*(.+)$/);
            if (kv && currentArr) {
              const obj = {}; const parts = kv[1].split(/\n\s{4}/);
              for (const part of parts) {
                const p2 = part.match(/^(\w+):\s*(.*)$/);
                if (p2) obj[p2[1]] = JSON.parse(p2[2]);
              }
              currentArr.push(obj);
            }
          }
          data = top;
        }
        if (kind === "expansions" && data.expansions) state.expansions = data.expansions;
        if (kind === "forms" && data.forms) state.forms = data.forms;
        if (kind === "variables" && data.variables) state.variables = data.variables;
        if (kind === "config" && data.config) state.config = data.config;
        if (kind === "all") {
          state.expansions = data.expansions || state.expansions;
          state.forms = data.forms || state.forms;
          state.variables = data.variables || state.variables;
          state.config = data.config || state.config;
        }
        persist();
        renderExpansions();
        renderForms();
        renderVariables();
        renderLibrary();
        populateConfigGUI();
        notify("Imported");
      } catch (e) {
        console.error(e);
        notify("Import failed");
      }
    };
    reader.readAsText(file);
  }

  // Bind UI
  function bind() {
    qsa(".nav-btn").forEach(btn => btn.addEventListener("click", () => setPanel(btn.dataset.tab)));

    document.addEventListener("keydown", (e) => {
      if (e.altKey && e.code === "Space") { e.preventDefault(); qs("#search").focus(); }
    });

    qs("#toggleTheme").addEventListener("click", () => { document.documentElement.classList.toggle("light"); notify("Theme toggled"); });

    // Search triggers re-renders for list views
    qs("#search").addEventListener("input", () => { renderExpansions(); renderForms(); renderVariables(); });

    // Expansion editor
    qs("#expType").addEventListener("change", () => { toggleExpEditMode(qs("#expType").value); updatePreview(); });
    qs("#expTrigger").addEventListener("input", updatePreview);
    qs("#expReplacement").addEventListener("input", updatePreview);
    qs("#expFormId").addEventListener("change", updatePreview);
    qs("#saveExpansion").addEventListener("click", saveExpansion);
    qs("#resetExpansion").addEventListener("click", () => {
      state.currentExpansion = { trigger: "", type: "text", replacement: "", category: "", notes: "", formId: "" };
      qs("#expTrigger").value = "";
      qs("#expReplacement").value = "";
      qs("#expCategory").value = "";
      qs("#expNotes").value = "";
      qs("#expType").value = "text";
      updatePreview();
    });

    // Forms
    qs("#addForm").addEventListener("click", addForm);
    qs("#dupForm").addEventListener("click", dupForm);
    qs("#delForm").addEventListener("click", delForm);
    qs("#addField").addEventListener("click", addField);
    qs("#addFieldFromVar").addEventListener("click", addFieldFromVar);
    qs("#saveForm").addEventListener("click", saveForm);

    // Variables
    qs("#addVariable").addEventListener("click", addVariable);

    // Config
    qs("#toggleYaml").addEventListener("click", () => {
      const box = qs("#yamlBox");
      const gui = qs("#configGui");
      const showYaml = box.classList.contains("hide");
      box.classList.toggle("hide", !showYaml);
      gui.classList.toggle("hide", showYaml);
      qs("#toggleYaml").textContent = showYaml ? "GUI Mode" : "YAML Mode";
    });
    qs("#saveConfig").addEventListener("click", saveConfig);

    // Import Export
    qs("#doImport").addEventListener("click", () => {
      const kind = qs("#importType").value;
      const file = qs("#importFile").files && qs("#importFile").files[0];
      if (!file) { notify("Pick a file"); return; }
      importData(file, kind);
    });
    qs("#doExport").addEventListener("click", () => {
      const kind = qs("#exportType").value;
      const format = qs("#exportFormat").value;
      exportData(kind, format);
    });
  }

  // Init
  (async function init() {
    bind();
    await loadAll();
    setPanel("composer");
    renderExpansions();
    renderForms();
    renderVariables();
    renderLibrary();
    populateConfigGUI();
    updatePreview();
    qs("#statusText").textContent = "Connected";
  })();
})();
