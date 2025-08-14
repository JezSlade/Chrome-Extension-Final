import { loadState, saveState } from "./common.js";
import { VARIABLE_TYPES } from "../js/schema.js";

// State for list view
let STATE = null;

// --------- Helpers retained from prior version ----------
function summarizeDefault(type, value) {
  if (Array.isArray(value)) return value.join(", ");
  if (type === "map" && typeof value === "object" && value) { try { return JSON.stringify(value); } catch { return "[object]"; } }
  if (type === "boolean") return value ? "true" : "false";
  if (value === undefined || value === null || value === "") return "(empty)";
  return String(value);
}

function renderList() {
  const tbody = document.querySelector("#table tbody"); tbody.innerHTML = "";
  for (const v of STATE.variables || []) {
    const tr = document.createElement("tr");

    const idCell = document.createElement("td"); idCell.textContent = v.id;
    const typeCell = document.createElement("td"); typeCell.textContent = v.type;
    const defCell = document.createElement("td"); defCell.className = "note"; defCell.textContent = summarizeDefault(v.type, v.default);
    const labelCell = document.createElement("td"); labelCell.textContent = v.label ?? "";

    const act = document.createElement("td");
    const editBtn = document.createElement("button"); editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openVarWizard("edit", v));
    const delBtn = document.createElement("button"); delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      const next = { ...STATE, variables: (STATE.variables || []).filter(x => x.id !== v.id), _meta: { ...(STATE._meta||{}), updatedAt: Date.now() } };
      await saveState(next); STATE = next; renderList();
    });
    act.appendChild(editBtn); act.appendChild(delBtn);

    tr.append(idCell, typeCell, defCell, labelCell, act);
    tbody.appendChild(tr);
  }
}

// --------- Wizard integration using provided library ----------
function buildStep1(draft) {
  // Build Basic step content with a Type select populated from VARIABLE_TYPES
  // If draft.type is empty, show a disabled placeholder that forces an explicit choice
  const placeholder = draft.type ? "" : `<option value="" disabled selected>Select a type...</option>`;
  const options = VARIABLE_TYPES.map(t => `<option value="${t}" ${draft.type === t ? "selected" : ""}>${t}</option>`).join("");
  return `
    <div class="field">
      <label>Variable ID</label>
      <input id="vw_id" name="vw_id" type="text" placeholder="myVar" value="${draft.id || ""}">
      <div class="help">Use inside a Cue as {{myVar}}</div>
    </div>
    <div class="field">
      <label>Label</label>
      <input id="vw_label" name="vw_label" type="text" placeholder="Human label" value="${draft.label || ""}">
    </div>
    <div class="field">
      <label>Type</label>
      <select id="vw_type" name="vw_type">
        ${placeholder}
        ${options}
      </select>
      <div class="help">Select a type to define the editor in the next step.</div>
    </div>
  `;
}

function buildStep2(draft) {
  // Dynamic editor based on type. Same logic as before, re-expressed as HTML strings.
  const t = draft.type;
  if (t === "dropdown" || t === "multiselect" || t === "checkbox" || t === "list") {
    const opts = Array.isArray(draft.options) ? draft.options : (Array.isArray(draft.default) ? draft.default : []);
    const optsText = opts.join("\n");
    if (t === "dropdown") {
      const selOps = opts.map(o => `<option value="${o}" ${String(draft.default || "") === o ? "selected" : ""}>${o}</option>`).join("");
      return `
        <div class="field">
          <label>Options - one per line</label>
          <textarea id="vw_opts" name="vw_opts" rows="6">${optsText}</textarea>
        </div>
        <div class="field">
          <label>Default selection</label>
          <select id="vw_default_select" name="vw_default_select">${selOps}</select>
        </div>
      `;
    }
    const selOps = opts.map(o => `<option value="${o}" ${Array.isArray(draft.default) && draft.default.includes(o) ? "selected" : ""}>${o}</option>`).join("");
    return `
      <div class="field">
        <label>Options - one per line</label>
        <textarea id="vw_opts" name="vw_opts" rows="6">${optsText}</textarea>
      </div>
      <div class="field">
        <label>Default selection - Ctrl or Cmd click for multiple</label>
        <select id="vw_default_multi" name="vw_default_multi" multiple size="6">${selOps}</select>
      </div>
    `;
  }
  if (t === "document" || t === "text" || t === "custom") {
    const val = String(draft.default ?? "");
    return `
      <div class="field">
        <label>Default content</label>
        <div class="toolbar">
          <button type="button" data-md="**">Bold</button>
          <button type="button" data-md="_">Italic</button>
          <button type="button" data-md="\`">Code</button>
        </div>
        <textarea id="vw_text_default" name="vw_text_default" rows="10">${val}</textarea>
      </div>
    `;
  }
  if (t === "number") {
    const val = draft.default === undefined || draft.default === null ? "" : String(draft.default);
    return `
      <div class="field">
        <label>Default number</label>
        <input id="vw_num_default" name="vw_num_default" type="number" step="any" value="${val}">
      </div>
    `;
  }
  if (t === "url") {
    const val = String(draft.default ?? "");
    return `
      <div class="field">
        <label>Default URL</label>
        <input id="vw_url_default" name="vw_url_default" type="url" placeholder="https://example.com" value="${val}">
      </div>
    `;
  }
  if (t === "email") {
    const val = String(draft.default ?? "");
    return `
      <div class="field">
        <label>Default email</label>
        <input id="vw_email_default" name="vw_email_default" type="email" placeholder="john@example.com" value="${val}">
      </div>
    `;
  }
  if (t === "color") {
    const val = typeof draft.default === "string" && draft.default.startsWith("#") ? draft.default : "#3366ff";
    return `
      <div class="field">
        <label>Default color</label>
        <input id="vw_color_default" name="vw_color_default" type="color" value="${val}">
      </div>
    `;
  }
  if (t === "boolean") {
    const trueSel = String(draft.default) === "true" || draft.default === true ? "selected" : "";
    const falseSel = !trueSel ? "selected" : "";
    return `
      <div class="field">
        <label>Default boolean</label>
        <select id="vw_bool_default" name="vw_bool_default">
          <option value="true" ${trueSel}>True</option>
          <option value="false" ${falseSel}>False</option>
        </select>
      </div>
    `;
  }
  if (t === "regex") {
    const val = String(draft.default ?? "");
    return `
      <div class="field">
        <label>Pattern</label>
        <input id="vw_regex_default" name="vw_regex_default" type="text" placeholder="^[A-Z]{3}\\d{2}$" value="${val}">
      </div>
    `;
  }
  if (t === "date" || t === "time" || t === "datetime") {
    const placeholder = t === "date" ? "%Y-%m-%d" : (t === "time" ? "%H:%M" : "%Y-%m-%d %H:%M");
    const val = String(draft.default ?? placeholder);
    return `
      <div class="field">
        <label>Format string</label>
        <input id="vw_dt_format" name="vw_dt_format" type="text" placeholder="${placeholder}" value="${val}">
        <div class="help">Rendering uses the format string when {{id}} is used.</div>
      </div>
    `;
  }
  if (t === "map") {
    let val;
    try { val = typeof draft.default === "string" ? draft.default : JSON.stringify(draft.default ?? {}, null, 2); } catch { val = "{}"; }
    return `
      <div class="field">
        <label>JSON object</label>
        <textarea id="vw_map_default" name="vw_map_default" rows="8">${val}</textarea>
      </div>
    `;
  }
  // generic
  const val = String(draft.default ?? "");
  return `
    <div class="field">
      <label>Default value</label>
      <input id="vw_generic_default" name="vw_generic_default" type="text" value="${val}">
    </div>
  `;
}

function finalizeFromWizardData(data) {
  const id = String(data.vw_id || "").trim();
  if (!id) throw new Error("ID required");
  const label = String(data.vw_label || "").trim();
  const type = String(data.vw_type || "");

  if (!type) throw new Error("Type required");

  let options;
  let def = "";

  if (type === "dropdown" || type === "multiselect" || type === "checkbox" || type === "list") {
    const opts = String(data.vw_opts || "").split("\n").map(s => s.trim()).filter(Boolean);
    options = opts;
    if (type === "dropdown") {
      def = data.vw_default_select || (opts[0] || "");
    } else {
      const multiSel = [];
      if (Array.isArray(data.vw_default_multi)) {
        for (const v of data.vw_default_multi) multiSel.push(v);
      } else if (typeof data.vw_default_multi === "string" && data.vw_default_multi.length) {
        multiSel.push(data.vw_default_multi);
      }
      def = multiSel;
    }
  } else if (type === "document" || type === "text" || type === "custom") {
    def = data.vw_text_default || "";
  } else if (type === "number") {
    def = data.vw_num_default === "" || data.vw_num_default === undefined ? "" : Number(data.vw_num_default);
  } else if (type === "url") {
    def = data.vw_url_default || "";
  } else if (type === "email") {
    def = data.vw_email_default || "";
  } else if (type === "color") {
    def = data.vw_color_default || "#3366ff";
  } else if (type === "boolean") {
    def = String(data.vw_bool_default) === "true";
  } else if (type === "regex") {
    def = data.vw_regex_default || "";
  } else if (type === "date" || type === "time" || type === "datetime") {
    const placeholder = type === "date" ? "%Y-%m-%d" : (type === "time" ? "%H:%M" : "%Y-%m-%d %H:%M");
    def = data.vw_dt_format || placeholder;
  } else if (type === "map") {
    try { def = JSON.parse(data.vw_map_default || "{}"); } catch { def = {}; }
  } else {
    def = data.vw_generic_default || "";
  }

  return { id, label, type, default: def, options };
}

function openVarWizard(mode, v) {
  const draft = {
    id: v?.id || "",
    label: v?.label || "",
    // Important: do not preselect a type on create. Force explicit user choice.
    type: v ? (v.type || "text") : "",
    default: v?.default ?? "",
    options: Array.isArray(v?.options) ? [...v.options] : (Array.isArray(v?.default) ? [...v.default] : undefined)
  };

  // Build base steps
  const wizard = new window.StepFormWizardModal({
    containerId: "varWizardContainer",
    title: mode === "edit" ? "Edit Variable" : "Create Variable",
    steps: [
      { title: "Basic", content: buildStep1(draft) },
      { title: "Content", content: draft.type ? buildStep2(draft) : `<div class="note">Select a type on Step 1, then click Next.</div>` },
      { title: "Review", content: `<div class="note" id="vw_review">Review will appear here.</div>` }
    ],
    onValidate: (stepIndex, stepData, allData) => {
      // Sync type changes and re-render Step 2 when needed
      const typeSel = document.getElementById("vw_type");
      if (typeSel) draft.type = typeSel.value;

      if (stepIndex === 0) {
        const idVal = String(document.getElementById("vw_id")?.value || "").trim();
        const typeVal = String(document.getElementById("vw_type")?.value || "");
        if (!idVal) { alert("ID required"); return false; }
        if (!typeVal) { alert("Type required"); return false; }

        // Recompute step 2 content based on selected type
        const s2 = buildStep2({ ...draft, type: typeVal });
        wizard.setStepContent(1, s2);
        wireMiniToolbar();
        return true;
      }
      if (stepIndex === 1) {
        // Accept any content. No heavy validation here.
        return true;
      }
      return true;
    },
    onStepChange: (to) => {
      if (to === 0) {
        // Focus the type select to encourage selection
        const sel = document.getElementById("vw_type");
        if (sel) sel.focus();
      }
      if (to === 1) {
        // entering Content step. Make sure dynamic content is in place and reacts to Type change if user goes back and forth
        const typeSel = document.getElementById("vw_type");
        if (typeSel) {
          typeSel.addEventListener("change", () => {
            draft.type = typeSel.value;
            wizard.setStepContent(1, buildStep2(draft));
            wireMiniToolbar();
          });
        }
        wireMiniToolbar();
        wireOptionsSync();
      }
      if (to === 2) {
        // entering Review. Compute summary
        const data = wizard.getFormData();
        let finalObj;
        try {
          finalObj = finalizeFromWizardData(data);
        } catch (e) {
          // If user somehow got here without type, block and send back to step 1
          alert(String(e));
          wizard.goToStep(0);
          return;
        }
        const review = document.getElementById("vw_review");
        review.textContent = `ID: ${finalObj.id} | Label: ${finalObj.label || "(none)"} | Type: ${finalObj.type} | Default: ${summarizeDefault(finalObj.type, finalObj.default)}`;
      }
    },
    onComplete: async (formData) => {
      try {
        const data = finalizeFromWizardData(formData);
        if (mode === "edit") {
          const idx = (STATE.variables || []).findIndex(x => x.id === (v?.id || ""));
          if (idx >= 0) {
            const next = { ...STATE };
            next.variables = [...(STATE.variables || [])];
            // If ID changed to a conflicting one, block
            if (data.id !== (v?.id || "") && (STATE.variables || []).some(x => x.id === data.id)) {
              alert("ID must be unique");
              return;
            }
            next.variables[idx] = { ...next.variables[idx], ...data };
            next._meta = { ...(next._meta || {}), updatedAt: Date.now() };
            await saveState(next); STATE = next; renderList();
          }
        } else {
          if ((STATE.variables || []).some(x => x.id === data.id)) { alert("ID must be unique"); return; }
          const next = { ...STATE };
          next.variables = [...(STATE.variables || []), data];
          next._meta = { ...(next._meta || {}), updatedAt: Date.now() };
          await saveState(next); STATE = next; renderList();
        }
      } catch (e) {
        alert(String(e));
      }
    }
  });

  // Open and prefill
  wizard.open({
    vw_id: draft.id,
    vw_label: draft.label,
    // Pass empty for create so the placeholder remains selected
    vw_type: draft.type
  });

  // Step specific wiring
  function wireMiniToolbar() {
    document.querySelectorAll('.toolbar button[data-md]').forEach(btn => {
      btn.onclick = () => {
        const ta = document.getElementById('vw_text_default');
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
  }
  function wireOptionsSync() {
    const optsArea = document.getElementById('vw_opts');
    const sel = document.getElementById('vw_default_select');
    const multi = document.getElementById('vw_default_multi');
    if (optsArea && (sel || multi)) {
      optsArea.addEventListener('input', () => {
        const lines = optsArea.value.split('\n').map(s => s.trim()).filter(Boolean);
        if (sel) {
          sel.innerHTML = lines.map(o => `<option value="${o}">${o}</option>`).join('');
        }
        if (multi) {
          multi.innerHTML = lines.map(o => `<option value="${o}">${o}</option>`).join('');
        }
      });
    }
  }
}

// --------- Boot ----------
async function boot() {
  STATE = await loadState();

  document.getElementById("add").addEventListener("click", () => openVarWizard("create", null));

  // Deep link open from library hash
  if (location.hash.startsWith("#edit=")) {
    const id = decodeURIComponent(location.hash.slice("#edit=".length));
    const v = (STATE.variables || []).find(x => x.id === id);
    if (v) openVarWizard("edit", v);
    history.replaceState(null, "", location.pathname);
  }

  renderList();
}
boot().catch(e => alert(String(e)));
