/* Variables CRUD + Wizard (registry-backed, no new deps)
   - Preserves prior public surface:
     - Imports: loadState, saveState from ./common.js
     - Imports: VARIABLE_TYPES from ../js/schema.js
     - UI hooks: #table tbody, #add button
   - Central VariableTypeRegistry used by CRUD and Wizard
   - Creates its own modal at runtime to avoid HTML edits
   - Storage shape is conservative and typed per variable.type
*/

import { loadState, saveState } from "./common.js";
import { VARIABLE_TYPES } from "../js/schema.js";

// --------------------------- State ---------------------------
let STATE = null;               // entire app state from storage
let DRAFT = null;               // working variable while wizard is open
let MODAL_EL = null;            // wizard modal root

// --------------------------- Utilities ---------------------------
function labeled(label, node) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const l = document.createElement("label");
  l.textContent = label;
  wrap.appendChild(l);
  wrap.appendChild(node);
  return wrap;
}

function summarizeDefault(type, value) {
  if (Array.isArray(value)) return value.join(", ");
  if (type === "filters" && typeof value === "object" && value && Array.isArray(value.rules)) return `${value.rules.length} rule(s)`;
  if (type === "boolean" || type === "checkbox") return value ? "true" : "false";
  if (value === undefined || value === null || value === "") return "(empty)";
  return String(value);
}

function splitLines(s) {
  return String(s || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);
}

function genId(base, existingIds) {
  const b = (base || "var").replace(/[^A-Za-z0-9_]/g, "_");
  let n = 1;
  let id = b;
  while (existingIds.has(id)) { n += 1; id = `${b}_${n}`; }
  return id;
}

// Added: passthrough parse hook to satisfy registry references
function noParse(x) { return x; }

// --------------------------- Registry ---------------------------
// Each entry: { label, renderInput(draft, onChange), parse(formData), validate(draft) -> {ok, msg}, preview(draft) -> string, normalize(draft) }
// renderInput returns a DOM element that contains the editor for "default" and any type-specific fields.
// All registry renderers must call onChange(updatedDraft) when values change, so preview stays in sync.

const VariableTypeRegistry = (() => {
  const textRenderer = (draft, onChange) => {
    const wrap = document.createElement("div");
    wrap.className = "vtype text-type";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Default text value";
    input.value = draft.default ?? "";
    input.addEventListener("input", () => {
      onChange({ ...draft, default: input.value });
    });
    wrap.appendChild(labeled("Default", input));
    return wrap;
  };

  const customRenderer = (draft, onChange) => {
    const wrap = document.createElement("div");
    wrap.className = "vtype custom-type";
    const name = document.createElement("input");
    name.type = "text";
    name.placeholder = "Custom variable name";
    name.value = draft.name ?? "";
    name.addEventListener("input", () => onChange({ ...draft, name: name.value }));

    const value = document.createElement("input");
    value.type = "text";
    value.placeholder = "Default value (optional)";
    value.value = draft.default ?? "";
    value.addEventListener("input", () => onChange({ ...draft, default: value.value }));

    wrap.appendChild(labeled("Name", name));
    wrap.appendChild(labeled("Default", value));
    return wrap;
  };

  const numberRenderer = (draft, onChange) => {
    const wrap = document.createElement("div");
    wrap.className = "vtype number-type";

    const def = document.createElement("input");
    def.type = "number";
    if (typeof draft.step === "number") def.step = String(draft.step);
    if (typeof draft.min === "number") def.min = String(draft.min);
    if (typeof draft.max === "number") def.max = String(draft.max);
    def.value = draft.default ?? "";
    def.addEventListener("input", () => {
      const v = def.value === "" ? "" : Number(def.value);
      onChange({ ...draft, default: v });
    });

    const min = document.createElement("input");
    min.type = "number";
    min.placeholder = "min (optional)";
    min.value = draft.min ?? "";
    min.addEventListener("input", () => onChange({ ...draft, min: min.value === "" ? undefined : Number(min.value) }));

    const max = document.createElement("input");
    max.type = "number";
    max.placeholder = "max (optional)";
    max.value = draft.max ?? "";
    max.addEventListener("input", () => onChange({ ...draft, max: max.value === "" ? undefined : Number(max.value) }));

    const step = document.createElement("input");
    step.type = "number";
    step.placeholder = "step (optional)";
    step.value = draft.step ?? "";
    step.addEventListener("input", () => onChange({ ...draft, step: step.value === "" ? undefined : Number(step.value) }));

    wrap.appendChild(labeled("Default", def));
    wrap.appendChild(labeled("Min", min));
    wrap.appendChild(labeled("Max", max));
    wrap.appendChild(labeled("Step", step));
    return wrap;
  };

  const documentRenderer = (draft, onChange) => {
    const wrap = document.createElement("div");
    wrap.className = "vtype document-type";
    const ta = document.createElement("textarea");
    ta.rows = 6;
    ta.placeholder = "Default document text";
    ta.value = draft.default ?? "";
    ta.addEventListener("input", () => onChange({ ...draft, default: ta.value }));
    wrap.appendChild(labeled("Default", ta));

    const file = document.createElement("input");
    file.type = "file";
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const text = await f.text();
      onChange({ ...draft, default: text });
      ta.value = text;
    });
    wrap.appendChild(labeled("Or upload file", file));
    return wrap;
  };

  const selectRenderer = (multiple) => (draft, onChange) => {
    const wrap = document.createElement("div");
    wrap.className = multiple ? "vtype multiselect-type" : "vtype select-type";

    const opts = document.createElement("textarea");
    opts.rows = 4;
    opts.placeholder = "One option per line";
    const normalized = Array.isArray(draft.options) ? draft.options : [];
    opts.value = normalized.join("\n");
    opts.addEventListener("input", () => {
      const list = splitLines(opts.value);
      onChange({ ...draft, options: list });
    });

    let select;
    if (multiple) {
      select = document.createElement("select");
      select.multiple = true;
    } else {
      select = document.createElement("select");
    }
    const updateSelect = () => {
      const list = Array.isArray(draft.options) ? draft.options : [];
      select.innerHTML = "";
      for (const o of list) {
        const opt = document.createElement("option");
        opt.value = o;
        opt.textContent = o;
        if (multiple) {
          const selected = Array.isArray(draft.default) ? draft.default.includes(o) : false;
          opt.selected = selected;
        } else {
          opt.selected = draft.default === o;
        }
        select.appendChild(opt);
      }
    };
    updateSelect();

    select.addEventListener("change", () => {
      if (multiple) {
        const vals = Array.from(select.selectedOptions).map(o => o.value);
        onChange({ ...draft, default: vals });
      } else {
        onChange({ ...draft, default: select.value });
      }
    });

    opts.addEventListener("input", updateSelect);

    wrap.appendChild(labeled("Options", opts));
    wrap.appendChild(labeled(multiple ? "Default selections" : "Default", select));
    return wrap;
  };

  const checkboxRenderer = (draft, onChange) => {
    const wrap = document.createElement("div");
    wrap.className = "vtype checkbox-type";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!draft.default;
    cb.addEventListener("change", () => onChange({ ...draft, default: !!cb.checked }));
    wrap.appendChild(labeled("Default", cb));
    return wrap;
  };

  const booleanRenderer = checkboxRenderer;

  const placeholderRenderer = (draft, onChange) => {
    const wrap = document.createElement("div");
    wrap.className = "vtype placeholder-type";
    const sel = document.createElement("select");
    const tokens = ["DATE", "TIME", "DATETIME", "CLIPBOARD", "USERNAME"];
    for (const t of tokens) {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = `{{${t}}}`;
      if (draft.key === t) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => onChange({ ...draft, key: sel.value, default: `{{${sel.value}}}` }));

    wrap.appendChild(labeled("Token", sel));
    return wrap;
  };

  const dateMathRenderer = (draft, onChange) => {
    const wrap = document.createElement("div");
    wrap.className = "vtype datemath-type";

    const base = document.createElement("input");
    base.type = "date";
    base.value = draft.base ?? "";
    base.addEventListener("input", () => onChange({ ...draft, base: base.value }));

    const op = document.createElement("select");
    for (const s of ["+", "-"]) {
      const o = document.createElement("option");
      o.value = s; o.textContent = s;
      if (draft.op === s) o.selected = true;
      op.appendChild(o);
    }
    op.addEventListener("change", () => onChange({ ...draft, op: op.value }));

    const amount = document.createElement("input");
    amount.type = "number";
    amount.value = draft.amount ?? 0;
    amount.addEventListener("input", () => onChange({ ...draft, amount: Number(amount.value || 0) }));

    const unit = document.createElement("select");
    for (const u of ["days", "weeks", "months", "years"]) {
      const o = document.createElement("option");
      o.value = u; o.textContent = u;
      if (draft.unit === u) o.selected = true;
      unit.appendChild(o);
    }
    unit.addEventListener("change", () => onChange({ ...draft, unit: unit.value }));

    wrap.appendChild(labeled("Base date", base));
    wrap.appendChild(labeled("Operation", op));
    wrap.appendChild(labeled("Amount", amount));
    wrap.appendChild(labeled("Unit", unit));
    return wrap;
  };

  const mathRenderer = (draft, onChange) => {
    const wrap = document.createElement("div");
    wrap.className = "vtype math-type";
    const expr = document.createElement("input");
    expr.type = "text";
    expr.placeholder = "Expression (safe subset)";
    expr.value = draft.expr ?? "";
    expr.addEventListener("input", () => onChange({ ...draft, expr: expr.value, default: expr.value }));
    const hint = document.createElement("div");
    hint.className = "note";
    hint.textContent = "Allowed: numbers, + - * / ( ) and decimals";
    wrap.appendChild(labeled("Expression", expr));
    wrap.appendChild(hint);
    return wrap;
  };

  const scriptRenderer = (draft, onChange) => {
    const wrap = document.createElement("div");
    wrap.className = "vtype script-type";
    const ta = document.createElement("textarea");
    ta.rows = 8;
    ta.placeholder = "JavaScript code";
    ta.value = draft.code ?? "";
    ta.addEventListener("input", () => onChange({ ...draft, code: ta.value }));
    wrap.appendChild(labeled("Code", ta));
    return wrap;
  };

  const timeframeRenderer = (draft, onChange) => {
    const wrap = document.createElement("div");
    wrap.className = "vtype timeframe-type";
    const start = document.createElement("input");
    start.type = "date";
    start.value = draft.start ?? "";
    start.addEventListener("input", () => onChange({ ...draft, start: start.value }));
    const end = document.createElement("input");
    end.type = "date";
    end.value = draft.end ?? "";
    end.addEventListener("input", () => onChange({ ...draft, end: end.value }));
    wrap.appendChild(labeled("Start", start));
    wrap.appendChild(labeled("End", end));
    return wrap;
  };

  const filtersRenderer = (draft, onChange) => {
    const wrap = document.createElement("div");
    wrap.className = "vtype filters-type";
    const list = Array.isArray(draft.rules) ? draft.rules : [];
    const table = document.createElement("table");
    table.className = "mini";
    const thead = document.createElement("thead");
    thead.innerHTML = `<tr><th>Field</th><th>Op</th><th>Value</th><th></th></tr>`;
    const tbody = document.createElement("tbody");
    table.appendChild(thead); table.appendChild(tbody);
    wrap.appendChild(table);

    const addRow = (r = { field: "", op: "=", value: "" }) => {
      const tr = document.createElement("tr");
      const f = document.createElement("input"); f.type = "text"; f.value = r.field;
      const o = document.createElement("select");
      for (const op of ["=", "!=", ">", "<", ">=", "<=", "in", "contains"]) {
        const opt = document.createElement("option"); opt.value = op; opt.textContent = op;
        if (op === r.op) opt.selected = true; o.appendChild(opt);
      }
      const v = document.createElement("input"); v.type = "text"; v.value = r.value;
      const del = document.createElement("button"); del.textContent = "X";

      const pushChange = () => {
        const rows = Array.from(tbody.querySelectorAll("tr")).map(row => {
          const [fI, oI, vI] = row.querySelectorAll("input, select");
          return { field: fI.value.trim(), op: oI.value, value: vI.value };
        });
        onChange({ ...draft, rules: rows });
      };

      [f, o, v].forEach(el => el.addEventListener("input", pushChange));
      del.addEventListener("click", () => { tr.remove(); pushChange(); });

      const td1 = document.createElement("td"); td1.appendChild(f);
      const td2 = document.createElement("td"); td2.appendChild(o);
      const td3 = document.createElement("td"); td3.appendChild(v);
      const td4 = document.createElement("td"); td4.appendChild(del);
      tr.append(td1, td2, td3, td4);
      tbody.appendChild(tr);
    };

    for (const r of list) addRow(r);

    const add = document.createElement("button");
    add.textContent = "Add rule";
    add.addEventListener("click", () => addRow());

    wrap.appendChild(add);
    return wrap;
  };

  const instructionRenderer = (draft, onChange) => {
    const wrap = document.createElement("div");
    wrap.className = "vtype instruction-type";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Comma separated tags, ex: system, concise";
    input.value = (Array.isArray(draft.tags) ? draft.tags : []).join(",");
    input.addEventListener("input", () => {
      const tags = input.value.split(",").map(s => s.trim()).filter(Boolean);
      onChange({ ...draft, tags });
    });
    wrap.appendChild(labeled("Tags", input));
    return wrap;
  };

  const map = new Map([
    ["text",       { label: "Text",        renderInput: textRenderer,          parse: noParse, validate: v_text,        preview: p_text,        normalize: n_idem }],
    ["custom",     { label: "Custom",      renderInput: customRenderer,        parse: noParse, validate: v_custom,      preview: p_text,        normalize: n_idem }],
    ["number",     { label: "Number",      renderInput: numberRenderer,        parse: noParse, validate: v_number,      preview: p_number,      normalize: n_idem }],
    ["document",   { label: "Document",    renderInput: documentRenderer,      parse: noParse, validate: v_document,    preview: p_doc,         normalize: n_idem }],
    ["select",     { label: "Dropdown",    renderInput: selectRenderer(false), parse: noParse, validate: v_select,      preview: p_select,      normalize: n_idem }],
    ["multiselect",{ label: "Multi-select",renderInput: selectRenderer(true),  parse: noParse, validate: v_multiselect, preview: p_multiselect, normalize: n_idem }],
    ["checkbox",   { label: "Checkbox",    renderInput: checkboxRenderer,      parse: noParse, validate: v_checkbox,    preview: p_checkbox,    normalize: n_idem }],
    ["boolean",    { label: "Boolean",     renderInput: checkboxRenderer,      parse: noParse, validate: v_checkbox,    preview: p_checkbox,    normalize: n_idem }],
    ["placeholder",{ label: "Placeholder", renderInput: placeholderRenderer,   parse: noParse, validate: v_placeholder,  preview: p_placeholder, normalize: n_placeholder }],
    ["date_math",  { label: "Date math",   renderInput: dateMathRenderer,      parse: noParse, validate: v_datemath,     preview: p_datemath,    normalize: n_idem }],
    ["math",       { label: "Math",        renderInput: mathRenderer,          parse: noParse, validate: v_math,         preview: p_math,        normalize: n_idem }],
    ["script",     { label: "Script",      renderInput: scriptRenderer,        parse: noParse, validate: v_script,       preview: p_script,      normalize: n_idem }],
    ["timeframe",  { label: "Timeframe",   renderInput: timeframeRenderer,     parse: noParse, validate: v_timeframe,    preview: p_timeframe,   normalize: n_idem }],
    ["filters",    { label: "Filters",     renderInput: filtersRenderer,       parse: noParse, validate: v_filters,      preview: p_filters,     normalize: n_idem }],
  ]);

  // If schema defines a list, keep only intersection to avoid unexpected types
  function allowedTypes() {
    const list = Array.isArray(VARIABLE_TYPES) ? VARIABLE_TYPES : Array.from(map.keys());
    return list.filter(t => map.has(t));
  }

  return {
    has: (t) => map.has(t),
    get: (t) => map.get(t),
    types: () => allowedTypes(),
  };
})();

// --------------------------- Validators ---------------------------
function v_text(d) { return ok(); }
function v_custom(d) {
  if (!d.name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(d.name)) return fail("Custom variable name required: letters, numbers, underscore, not starting with a number");
  return ok();
}
function v_number(d) {
  if (d.default !== "" && typeof d.default !== "number") return fail("Default must be a number or empty");
  if (typeof d.min === "number" && typeof d.max === "number" && d.min > d.max) return fail("Min cannot be greater than max");
  return ok();
}
function v_document(d) { return ok(); }
function v_select(d) {
  if (!Array.isArray(d.options) || d.options.length === 0) return fail("At least one option is required");
  if (d.default && !d.options.includes(d.default)) return fail("Default must be one of the options");
  return ok();
}
function v_multiselect(d) {
  if (!Array.isArray(d.options) || d.options.length === 0) return fail("At least one option is required");
  if (!Array.isArray(d.default || [])) return fail("Default must be an array for multiselect");
  for (const v of d.default) if (!d.options.includes(v)) return fail("Default selections must be present in options");
  return ok();
}
function v_checkbox(d) { return ok(); }
function v_placeholder(d) {
  if (!d.key) return fail("Choose a token");
  return ok();
}
function v_datemath(d) {
  if (!d.base) return fail("Base date is required");
  if (!["+", "-"].includes(d.op)) return fail("Choose + or -");
  if (!["days", "weeks", "months", "years"].includes(d.unit)) return fail("Invalid unit");
  if (typeof d.amount !== "number" || !isFinite(d.amount)) return fail("Amount must be a number");
  return ok();
}
function v_math(d) {
  if (!d.expr || /[^0-9+\-*/().\s]/.test(d.expr)) return fail("Expression allows digits, + - * / ( ) and spaces");
  return ok();
}
function v_script(d) { return ok(); }
function v_timeframe(d) {
  if (!d.start || !d.end) return fail("Start and End are required");
  if (d.end < d.start) return fail("End cannot be before Start");
  return ok();
}
function v_filters(d) {
  if (!Array.isArray(d.rules)) return fail("Rules must be an array");
  return ok();
}

function ok() { return { ok: true, msg: "" }; }
function fail(msg) { return { ok: false, msg }; }

// --------------------------- Previewers ---------------------------
function p_text(d) { return String(d.default ?? ""); }
function p_number(d) { return d.default === "" ? "" : String(d.default); }
function p_doc(d) { return (d.default ?? "").slice(0, 120); }
function p_select(d) { return String(d.default ?? ""); }
function p_multiselect(d) { return Array.isArray(d.default) ? d.default.join(", ") : ""; }
function p_checkbox(d) { return (d.default ? "true" : "false"); }
function p_placeholder(d) { return d.key ? `{{${d.key}}}` : ""; }
function p_datemath(d) { return `${d.base || ""} ${d.op || ""} ${d.amount || 0} ${d.unit || ""}`.trim(); }
function p_math(d) { return d.expr ?? ""; }
function p_script(d) { return (d.code || "").split("\n")[0].slice(0, 80); }
function p_timeframe(d) { return d.start && d.end ? `${d.start} to ${d.end}` : ""; }
function p_filters(d) { return Array.isArray(d.rules) ? `${d.rules.length} rule(s)` : "0 rule"; }

// --------------------------- Normalizers ---------------------------
function n_idem(d) { return d; }
function n_placeholder(d) { return { ...d, default: d.key ? `{{${d.key}}}` : d.default }; }

// --------------------------- List view ---------------------------
function renderList() {
  const tbody = document.querySelector("#table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const list = Array.isArray(STATE?.variables) ? STATE.variables : [];
  for (const v of list) {
    const tr = document.createElement("tr");

    const idCell = document.createElement("td"); idCell.textContent = v.id;
    const typeCell = document.createElement("td"); typeCell.textContent = v.type;
    const defCell = document.createElement("td"); defCell.className = "note"; defCell.textContent = summarizeDefault(v.type, v.default ?? v);
    const labelCell = document.createElement("td"); labelCell.textContent = v.label ?? "";

    const act = document.createElement("td");
    const editBtn = document.createElement("button"); editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openVarWizard("edit", v));
    const delBtn = document.createElement("button"); delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      const nextVars = list.filter(x => x.id !== v.id);
      const next = { ...(STATE || {}), variables: nextVars, _meta: { ...(STATE?._meta || {}), updatedAt: Date.now() } };
      await saveState(next);
      STATE = next;
      renderList();
    });
    act.appendChild(editBtn); act.appendChild(delBtn);

    tr.append(idCell, typeCell, defCell, labelCell, act);
    tbody.appendChild(tr);
  }
}

// --------------------------- Wizard ---------------------------
function openVarWizard(mode, existingVar) {
  // mode: "create" | "edit"
  DRAFT = existingVar ? structuredClone(existingVar) : {
    id: "",
    label: "",
    type: VariableTypeRegistry.types()[0] || "text",
    default: "",
  };

  if (mode === "create") {
    const ids = new Set((STATE?.variables || []).map(v => v.id));
    DRAFT.id = genId("var", ids);
  } else if (existingVar) {
    DRAFT._fromEdit = true;
    DRAFT._originalId = existingVar.id;
  }

  ensureModal();
  WZ_STEP = 1;
  renderWizard(mode);
}

function ensureModal() {
  if (MODAL_EL && document.body.contains(MODAL_EL)) return;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span id="wz-title">Variable</span>
        <button id="wz-close" aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <div id="wz-step"></div>
        <div class="preview">
          <div class="preview-title">Preview</div>
          <pre id="wz-preview"></pre>
        </div>
      </div>
      <div class="modal-footer">
        <button id="wz-back">Back</button>
        <button id="wz-next">Next</button>
        <button id="wz-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  overlay.querySelector("#wz-close").addEventListener("click", closeModal);
  MODAL_EL = overlay;
  injectModalStylesOnce();
}

function closeModal() {
  if (MODAL_EL && MODAL_EL.parentNode) MODAL_EL.parentNode.removeChild(MODAL_EL);
  MODAL_EL = null;
  DRAFT = null;
}

function injectModalStylesOnce() {
  if (document.getElementById("variables-crud-modal-css")) return;
  const css = document.createElement("style");
  css.id = "variables-crud-modal-css";
  css.textContent = `
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:9999}
  .modal{width:720px;max-width:92vw;background:#111;color:#eee;border:1px solid #333;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.5)}
  .modal-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #2a2a2a}
  .modal-body{display:grid;grid-template-columns:1fr 280px;gap:16px;padding:16px}
  .modal-footer{display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid #2a2a2a}
  .field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
  .field label{font-size:12px;color:#aaa}
  .note{opacity:.8;font-size:12px}
  .preview{border-left:1px dashed #333;padding-left:12px}
  .preview-title{font-size:12px;color:#aaa;margin-bottom:6px}
  input[type="text"],input[type="number"],input[type="date"],textarea,select{background:#1a1a1a;color:#eee;border:1px solid #333;border-radius:8px;padding:8px}
  textarea{resize:vertical}
  table.mini{width:100%;border-collapse:collapse;margin:8px 0}
  table.mini th,table.mini td{border:1px solid #333;padding:6px;text-align:left;font-size:12px}
  `;
  document.head.appendChild(css);
}

let WZ_STEP = 1; // 1: basics, 2: type-specific

function renderWizard(mode) {
  if (!MODAL_EL) return;
  MODAL_EL.querySelector("#wz-title").textContent = mode === "edit" ? `Edit variable: ${DRAFT.id}` : "Create variable";

  const step = MODAL_EL.querySelector("#wz-step");
  step.innerHTML = "";

  if (WZ_STEP === 1) {
    step.appendChild(buildStep1(DRAFT, (upd) => { DRAFT = upd; updatePreview(); }));
  } else {
    step.appendChild(buildStep2(DRAFT, (upd) => { DRAFT = upd; updatePreview(); }));
  }

  updatePreview();

  const back = MODAL_EL.querySelector("#wz-back");
  const next = MODAL_EL.querySelector("#wz-next");
  const save = MODAL_EL.querySelector("#wz-save");

  back.disabled = (WZ_STEP === 1);
  next.style.display = (WZ_STEP === 1) ? "" : "none";
  save.style.display = (WZ_STEP === 2) ? "" : "none";

  back.onclick = () => { if (WZ_STEP > 1) { WZ_STEP = 1; renderWizard(mode); } };
  next.onclick = () => {
    const res = validateBasics(DRAFT);
    if (!res.ok) { alert(res.msg); return; }
    WZ_STEP = 2;
    renderWizard(mode);
  };
  save.onclick = async () => {
    const res = validateTyped(DRAFT);
    if (!res.ok) { alert(res.msg); return; }
    await persistDraft(mode, DRAFT);
    closeModal();
    renderList();
  };
}

function buildStep1(draft, onChange) {
  const wrap = document.createElement("div");

  const id = document.createElement("input");
  id.type = "text"; id.value = draft.id || ""; id.placeholder = "Variable id (unique)";
  id.addEventListener("input", () => onChange({ ...draft, id: id.value.trim() }));

  const label = document.createElement("input");
  label.type = "text"; label.value = draft.label || ""; label.placeholder = "Human label (optional)";
  label.addEventListener("input", () => onChange({ ...draft, label: label.value }));

  const typeSel = document.createElement("select");
  for (const t of VariableTypeRegistry.types()) {
    const opt = document.createElement("option");
    opt.value = t; opt.textContent = t;
    if (draft.type === t) opt.selected = true;
    typeSel.appendChild(opt);
  }
  typeSel.addEventListener("change", () => onChange({ ...draft, type: typeSel.value }));

  wrap.appendChild(labeled("Id", id));
  wrap.appendChild(labeled("Label", label));
  wrap.appendChild(labeled("Type", typeSel));
  return wrap;
}

function buildStep2(draft, onChange) {
  const entry = VariableTypeRegistry.get(draft.type);
  const wrap = document.createElement("div");
  if (!entry) {
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = `No renderer for type: ${draft.type}`;
    wrap.appendChild(note);
    return wrap;
  }
  const editor = entry.renderInput(draft, onChange);
  wrap.appendChild(editor);
  return wrap;
}

function updatePreview() {
  if (!MODAL_EL) return;
  const pre = MODAL_EL.querySelector("#wz-preview");
  const entry = VariableTypeRegistry.get(DRAFT.type);
  let txt = "";
  if (entry && typeof entry.preview === "function") {
    try { txt = entry.preview(DRAFT) || ""; } catch { txt = ""; }
  }
  const copy = { ...DRAFT };
  if (entry && typeof entry.normalize === "function") {
    try { Object.assign(copy, entry.normalize(DRAFT)); } catch {}
  }
  pre.textContent = [
    `type: ${copy.type}`,
    DRAFT.id ? `id: ${DRAFT.id}` : "",
    copy.label ? `label: ${copy.label}` : "",
    `preview: ${txt}`
  ].filter(Boolean).join("\n");
}

function validateBasics(draft) {
  if (!draft.id || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(draft.id)) return fail("Id required: letters, numbers, underscore, not starting with a number");
  const ids = new Set((STATE?.variables || []).map(v => v.id));
  if (!DRAFT || !DRAFT._fromEdit) {
    if (ids.has(draft.id)) return fail("Id already exists");
  } else {
    if (draft.id !== DRAFT._originalId && ids.has(draft.id)) return fail("Id already exists");
  }
  if (!draft.type || !VariableTypeRegistry.has(draft.type)) return fail("Choose a valid type");
  return ok();
}

function validateTyped(draft) {
  const entry = VariableTypeRegistry.get(draft.type);
  if (!entry || typeof entry.validate !== "function") return ok();
  return entry.validate(draft);
}

async function persistDraft(mode, draft) {
  const list = Array.isArray(STATE?.variables) ? [...STATE.variables] : [];
  const normalized = (() => {
    const entry = VariableTypeRegistry.get(draft.type);
    if (entry && typeof entry.normalize === "function") return entry.normalize(draft);
    return draft;
  })();
  const item = {
    id: draft.id,
    label: draft.label || "",
    type: draft.type,
    ...pickTypePayload(draft.type, normalized),
  };

  if (mode === "create") {
    list.push(item);
  } else {
    const idx = list.findIndex(v => v.id === (draft._originalId || draft.id));
    if (idx >= 0) list[idx] = item; else list.push(item);
  }

  const next = { ...(STATE || {}), variables: list, _meta: { ...(STATE?._meta || {}), updatedAt: Date.now() } };
  await saveState(next);
  STATE = next;
}

function pickTypePayload(type, draft) {
  switch (type) {
    case "text": return { default: draft.default ?? "" };
    case "custom": return { name: draft.name ?? "", default: draft.default ?? "" };
    case "number": return { default: draft.default ?? "", min: draft.min, max: draft.max, step: draft.step };
    case "document": return { default: draft.default ?? "" };
    case "select": return { options: Array.isArray(draft.options) ? draft.options : [], default: draft.default ?? "" };
    case "multiselect": return { options: Array.isArray(draft.options) ? draft.options : [], default: Array.isArray(draft.default) ? draft.default : [] };
    case "checkbox":
    case "boolean": return { default: !!draft.default };
    case "placeholder": return { key: draft.key ?? "", default: draft.default ?? "" };
    case "date_math": return { base: draft.base ?? "", op: draft.op ?? "+", amount: Number(draft.amount || 0), unit: draft.unit ?? "days" };
    case "math": return { expr: draft.expr ?? "", default: draft.expr ?? "" };
    case "script": return { lang: draft.lang || "js", code: draft.code || "" };
    case "timeframe": return { start: draft.start ?? "", end: draft.end ?? "" };
    case "filters": return { rules: Array.isArray(draft.rules) ? draft.rules : [] };
    default: return { default: draft.default ?? "" };
  }
}

// --------------------------- Boot ---------------------------
async function boot() {
  STATE = await loadState();
  const addBtn = document.getElementById("add");
  if (addBtn) addBtn.addEventListener("click", () => { WZ_STEP = 1; openVarWizard("create", null); });

  if (location.hash.startsWith("#edit=")) {
    const id = decodeURIComponent(location.hash.slice("#edit=".length));
    const v = (STATE?.variables || []).find(x => x.id === id);
    if (v) {
      WZ_STEP = 1;
      const editDraft = structuredClone(v);
      editDraft._fromEdit = true;
      editDraft._originalId = v.id;
      openVarWizard("edit", editDraft);
    }
    history.replaceState(null, "", location.pathname);
  }

  renderList();
}
boot().catch(e => alert(String(e)));
