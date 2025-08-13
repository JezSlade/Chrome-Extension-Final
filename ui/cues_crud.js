import { loadState, saveState } from "./common.js";
import { uuid } from "../js/utils.js";

let STATE = null;

function render() {
  const tbody = document.querySelector('#table tbody'); tbody.innerHTML = "";
  for (const c of STATE.cues || []) {
    const tr = document.createElement('tr');
    // enabled
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = c.enabled !== false;
    cb.addEventListener('change', async () => updateCue(c.id, { enabled: cb.checked }));
    // trigger
    const t = document.createElement('input'); t.type = 'text'; t.value = c.trigger;
    t.addEventListener('input', () => t.dataset.dirty = "1");
    t.addEventListener('change', async () => {
      // enforce unique triggers
      if ((STATE.cues || []).some(x => x.id !== c.id && x.trigger === t.value)) { alert('Trigger must be unique'); t.value = c.trigger; return; }
      await updateCue(c.id, { trigger: t.value });
    });
    // template
    const area = document.createElement('textarea'); area.rows = 2; area.value = c.template;
    area.addEventListener('change', async () => updateCue(c.id, { template: area.value }));
    // actions
    const del = document.createElement('button'); del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      const next = { ...STATE, cues: (STATE.cues || []).filter(x => x.id !== c.id), _meta: { ...(STATE._meta||{}), updatedAt: Date.now() } };
      await saveState(next); STATE = next; render();
    });
    const td0 = document.createElement('td'); td0.appendChild(cb);
    const td1 = document.createElement('td'); td1.appendChild(t);
    const td2 = document.createElement('td'); td2.appendChild(area);
    const td3 = document.createElement('td'); td3.appendChild(del);
    tr.append(td0, td1, td2, td3);
    tbody.appendChild(tr);
  }
}

async function updateCue(id, patch) {
  const idx = (STATE.cues || []).findIndex(x => x.id === id);
  if (idx < 0) return;
  const next = { ...STATE };
  next.cues = [...STATE.cues];
  next.cues[idx] = { ...next.cues[idx], ...patch };
  next._meta = { ...(next._meta || {}), updatedAt: Date.now() };
  await saveState(next); STATE = next;
}

async function boot() {
  STATE = await loadState();
  document.getElementById('add').addEventListener('click', async () => {
    const id = uuid();
    const trig = (STATE.settings?.triggerPrefix || ":") + "newcue";
    const cue = { id, trigger: trig, template: "New template", enabled: true };
    const next = { ...STATE, cues: [...(STATE.cues || []), cue], _meta: { ...(STATE._meta||{}), updatedAt: Date.now() } };
    await saveState(next); STATE = next; render();
  });
  render();
}
boot().catch(e => alert(String(e)));
