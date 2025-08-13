// ui/options.js - Settings, cues, and variables manager

import { VARIABLE_TYPES } from "../js/schema.js";

function msg(type, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, resolve);
  });
}

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) e.appendChild(c);
  return e;
}

let STATE = null;

async function load() {
  const res = await msg('GET_STATE');
  if (!res.ok) throw new Error(res.error || 'Failed to get state');
  STATE = res.state;
  renderSettings();
  renderCues();
  renderVars();
}

function renderSettings() {
  const s = STATE.settings;
  document.getElementById('triggerPrefix').value = s.triggerPrefix || ":";
  document.getElementById('autoExpand').value = s.autoExpand ? "true" : "false";
  document.getElementById('theme').value = s.theme || "system";

  document.getElementById('triggerPrefix').addEventListener('input', saveSettings);
  document.getElementById('autoExpand').addEventListener('change', saveSettings);
  document.getElementById('theme').addEventListener('change', saveSettings);
}

async function saveSettings() {
  const next = {
    ...STATE,
    settings: {
      ...STATE.settings,
      triggerPrefix: document.getElementById('triggerPrefix').value || ":",
      autoExpand: document.getElementById('autoExpand').value === "true",
      theme: document.getElementById('theme').value
    }
  };
  await msg('SET_STATE', { state: next });
  STATE = next;
}

function renderCues() {
  const tbody = document.querySelector('#cuesTable tbody');
  tbody.innerHTML = "";
  for (const c of STATE.cues || []) {
    const tr = el('tr', {}, [
      el('td', {}, [ (() => {
        const cb = el('input', { type: 'checkbox' });
        cb.checked = c.enabled !== false;
        cb.addEventListener('change', async () => {
          c.enabled = cb.checked;
          await persist();
        });
        return cb;
      })() ]),
      el('td', {}, [ (() => {
        const inp = el('input', { type: 'text' });
        inp.value = c.trigger;
        inp.addEventListener('input', async () => {
          c.trigger = inp.value;
          await persist();
        });
        return inp;
      })() ]),
      el('td', {}, [ (() => {
        const area = el('textarea', { rows: '2' });
        area.value = c.template;
        area.addEventListener('input', async () => {
          c.template = area.value;
          await persist();
        });
        return area;
      })() ]),
      el('td', {}, [
        (() => {
          const del = el('button', { text: 'Delete' });
          del.addEventListener('click', async () => {
            STATE.cues = (STATE.cues || []).filter(x => x.id !== c.id);
            await persist();
            renderCues();
          });
          return del;
        })()
      ])
    ]);
    tbody.appendChild(tr);
  }

  document.getElementById('addCue').onclick = async () => {
    const id = crypto.randomUUID();
    const trigger = (STATE.settings?.triggerPrefix || ":") + "newcue";
    const cue = { id, trigger, template: "New template", enabled: true };
    STATE.cues = [...(STATE.cues || []), cue];
    await persist();
    renderCues();
  };

  document.getElementById('exportData').onclick = async () => {
    const res = await msg('EXPORT_DATA');
    if (!res.ok) return alert('Export failed: ' + res.error);
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'toolforge-export.json';
    a.click();
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

function renderVars() {
  const tbody = document.querySelector('#varsTable tbody');
  tbody.innerHTML = "";
  for (const v of STATE.variables || []) {
    const tr = el('tr', {}, [
      el('td', {}, [ (() => {
        const inp = el('input', { type: 'text' });
        inp.value = v.id;
        inp.addEventListener('input', async () => {
          v.id = inp.value;
          await persist();
        });
        return inp;
      })() ]),
      el('td', {}, [ (() => {
        const sel = el('select');
        for (const t of VARIABLE_TYPES) {
          const opt = el('option', { value: t, text: t });
          if (v.type === t) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', async () => {
          v.type = sel.value;
          await persist();
        });
        return sel;
      })() ]),
      el('td', {}, [ (() => {
        const inp = el('input', { type: 'text' });
        inp.value = v.default ?? "";
        inp.addEventListener('input', async () => {
          v.default = inp.value;
          await persist();
        });
        return inp;
      })() ]),
      el('td', {}, [ (() => {
        const inp = el('input', { type: 'text' });
        inp.value = v.label ?? "";
        inp.addEventListener('input', async () => {
          v.label = inp.value;
          await persist();
        });
        return inp;
      })() ]),
      el('td', {}, [
        (() => {
          const del = el('button', { text: 'Delete' });
          del.addEventListener('click', async () => {
            STATE.variables = (STATE.variables || []).filter(x => x !== v);
            await persist();
            renderVars();
          });
          return del;
        })()
      ])
    ]);
    tbody.appendChild(tr);
  }

  document.getElementById('addVar').onclick = async () => {
    STATE.variables = [...(STATE.variables || []), { id: "var_" + crypto.randomUUID().slice(0, 8), type: "text", default: "", label: "" }];
    await persist();
    renderVars();
  };
}

async function persist() {
  const next = {
    ...STATE,
    _meta: {
      ...(STATE._meta || {}),
      updatedAt: Date.now()
    }
  };
  const res = await chrome.runtime.sendMessage({ type: 'SET_STATE', state: next });
  if (!res.ok) throw new Error(res.error || 'Persist failed');
}

load().catch(err => {
  console.error(err);
  alert('Failed to load settings');
});
