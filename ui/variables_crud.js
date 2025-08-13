import { loadState, saveState } from "./common.js";
import { VARIABLE_TYPES } from "../js/schema.js";
import { uuid } from "../js/utils.js";

let STATE = null;

function render() {
  const tbody = document.querySelector('#table tbody'); tbody.innerHTML = "";
  for (const v of STATE.variables || []) {
    const tr = document.createElement('tr');
    // id
    const idInput = document.createElement('input'); idInput.type = 'text'; idInput.value = v.id;
    idInput.addEventListener('change', async () => {
      const newId = idInput.value.trim();
      if (!newId) { alert('ID required'); idInput.value = v.id; return; }
      if ((STATE.variables || []).some(x => x.id !== v.id && x.id === newId)) { alert('ID must be unique'); idInput.value = v.id; return; }
      await updateVar(v.id, { id: newId });
    });
    // type
    const sel = document.createElement('select');
    for (const t of VARIABLE_TYPES) {
      const o = document.createElement('option'); o.value = t; o.textContent = t;
      if (v.type === t) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', async () => updateVar(v.id, { type: sel.value }));
    // default
    const def = document.createElement('input'); def.type = 'text'; def.value = v.default ?? "";
    def.addEventListener('change', async () => updateVar(v.id, { default: def.value }));
    // label
    const lab = document.createElement('input'); lab.type = 'text'; lab.value = v.label ?? "";
    lab.addEventListener('change', async () => updateVar(v.id, { label: lab.value }));
    // actions
    const del = document.createElement('button'); del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      const next = { ...STATE, variables: (STATE.variables || []).filter(x => x.id !== v.id), _meta: { ...(STATE._meta||{}), updatedAt: Date.now() } };
      await saveState(next); STATE = next; render();
    });

    const td1 = document.createElement('td'); td1.appendChild(idInput);
    const td2 = document.createElement('td'); td2.appendChild(sel);
    const td3 = document.createElement('td'); td3.appendChild(def);
    const td4 = document.createElement('td'); td4.appendChild(lab);
    const td5 = document.createElement('td'); td5.appendChild(del);
    tr.append(td1, td2, td3, td4, td5);
    tbody.appendChild(tr);
  }
}

async function updateVar(id, patch) {
  const idx = (STATE.variables || []).findIndex(x => x.id === id);
  if (idx < 0) return;
  // if patch contains id rename, ensure uniqueness handled before
  const next = { ...STATE };
  next.variables = [...STATE.variables];
  next.variables[idx] = { ...next.variables[idx], ...patch };
  next._meta = { ...(next._meta || {}), updatedAt: Date.now() };
  await saveState(next); STATE = next; render();
}

async function boot() {
  STATE = await loadState();
  document.getElementById('add').addEventListener('click', async () => {
    const id = "var_" + uuid().slice(0,8);
    const v = { id, type: "text", default: "", label: "" };
    const next = { ...STATE, variables: [...(STATE.variables || []), v], _meta: { ...(STATE._meta||{}), updatedAt: Date.now() } };
    await saveState(next); STATE = next; render();
  });
  render();
}
boot().catch(e => alert(String(e)));
