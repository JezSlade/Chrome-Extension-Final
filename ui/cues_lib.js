import { loadState, saveState } from "./common.js";

let STATE = null;
let FILTER = "";

function row(c) {
  const tr = document.createElement('tr');
  const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = c.enabled !== false;
  cb.addEventListener('change', async () => {
    const idx = (STATE.cues || []).findIndex(x => x.id === c.id);
    if (idx >= 0) {
      const next = { ...STATE };
      next.cues = [...STATE.cues];
      next.cues[idx] = { ...next.cues[idx], enabled: cb.checked };
      next._meta = { ...(next._meta||{}), updatedAt: Date.now() };
      await saveState(next);
      STATE = next;
    }
  });
  const td0 = document.createElement('td'); td0.appendChild(cb);
  const td1 = document.createElement('td'); td1.textContent = c.trigger;
  const td2 = document.createElement('td'); td2.textContent = c.template;
  tr.append(td0, td1, td2);
  return tr;
}

function render() {
  const tbody = document.querySelector('#table tbody'); tbody.innerHTML = "";
  const list = (STATE.cues || []).filter(c =>
    !FILTER || c.trigger.toLowerCase().includes(FILTER) || c.template.toLowerCase().includes(FILTER)
  );
  for (const c of list) tbody.appendChild(row(c));
}

async function boot() {
  STATE = await loadState();
  document.getElementById('search').addEventListener('input', (e)=>{ FILTER = e.target.value.toLowerCase(); render(); });
  render();
}
boot().catch(e => alert(String(e)));
