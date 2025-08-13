import { loadState } from "./common.js";

let STATE = null;
let FILTER = "";

function row(v) {
  const tr = document.createElement('tr');
  const td1 = document.createElement('td'); td1.textContent = v.id;
  const td2 = document.createElement('td'); td2.textContent = v.type;
  const td3 = document.createElement('td'); td3.textContent = v.default ?? "";
  const td4 = document.createElement('td'); td4.textContent = v.label ?? "";
  tr.append(td1, td2, td3, td4);
  return tr;
}
function render() {
  const tbody = document.querySelector('#table tbody'); tbody.innerHTML = "";
  const list = (STATE.variables || []).filter(v =>
    !FILTER || v.id.toLowerCase().includes(FILTER) || String(v.default ?? "").toLowerCase().includes(FILTER) || String(v.label ?? "").toLowerCase().includes(FILTER) || v.type.toLowerCase().includes(FILTER)
  );
  for (const v of list) tbody.appendChild(row(v));
}

async function boot() {
  STATE = await loadState();
  document.getElementById('search').addEventListener('input', (e)=>{ FILTER = e.target.value.toLowerCase(); render(); });
  render();
}
boot().catch(e => alert(String(e)));
