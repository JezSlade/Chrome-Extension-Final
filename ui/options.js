import { loadState, saveState, msg } from "./common.js";

let STATE = null;

async function load() {
  STATE = await loadState();
  document.getElementById('triggerPrefix').value = STATE.settings.triggerPrefix || ":";
  document.getElementById('autoExpand').value = STATE.settings.autoExpand ? "true" : "false";
  document.getElementById('theme').value = STATE.settings.theme || "system";

  document.getElementById('triggerPrefix').addEventListener('input', persist);
  document.getElementById('autoExpand').addEventListener('change', persist);
  document.getElementById('theme').addEventListener('change', persist);

  document.getElementById('exportData').onclick = async () => {
    const res = await msg('EXPORT_DATA');
    if (!res.ok) return alert('Export failed: ' + res.error);
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'toolforge-export.json'; a.click();
    URL.revokeObjectURL(url);
  };
  document.getElementById('importData').onclick = async () => {
    const file = document.getElementById('importFile').files[0];
    if (!file) return alert('Choose a file first');
    const txt = await file.text();
    const data = JSON.parse(txt);
    const res = await msg('IMPORT_DATA', { data });
    if (!res.ok) return alert('Import failed: ' + res.error);
    await load();
    alert('Import complete');
  };
}

async function persist() {
  const next = {
    ...STATE,
    settings: {
      ...STATE.settings,
      triggerPrefix: document.getElementById('triggerPrefix').value || ":",
      autoExpand: document.getElementById('autoExpand').value === "true",
      theme: document.getElementById('theme').value
    },
    _meta: { ...(STATE._meta||{}), updatedAt: Date.now() }
  };
  await saveState(next);
  STATE = next;
}
load().catch(e => alert(String(e)));
