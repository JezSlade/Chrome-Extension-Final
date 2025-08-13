// ui/manager.bundle.js
// Single-file bundled Manager UI for MV3 Options page.
// Purpose: remove runtime module graph & cache fragility. No external deps.
// NOTE: This file is generated as a minimal, hand-crafted bundle based on:
// - ui/utils.js
// - ui/app.js
// - ui/modules/{expansions,variables,forms,prompts,settings,help}.js
// Any functional changes must be mirrored in source modules.

// =============================
// utils.js (inlined)
// =============================
const appEl = () => document.getElementById('app');

function el(tag, attrs = {}, ...children){
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})){
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for (const c of children){
    if (c == null) continue;
    if (c instanceof Node) { e.appendChild(c); continue; }
    if (Array.isArray(c)) { c.forEach(x => x && e.appendChild(x instanceof Node ? x : document.createTextNode(String(x)))); continue; }
    e.appendChild(document.createTextNode(String(c)));
  }
  return e;
}

function h(tag, attrs = {}, children = []){
  return el(tag, attrs, ...(Array.isArray(children) ? children : [children]));
}

function showToast(message, opts = {}){
  const box = el('div', { class: 'toast ' + (opts.tone || 'info') },
    el('div', { class: 'toast-message', html: message })
  );
  document.body.appendChild(box);
  setTimeout(()=> box.classList.add('show'), 0);
  const t = opts.duration || 2400;
  setTimeout(()=>{ box.classList.remove('show'); setTimeout(()=> box.remove(), 300); }, t);
}

// ---------- Simple state store ----------
let __state = { filter:'', sync:{ phase:'idle', last:null }, tab:'expansions', data:{} };
let __subs = [];
function getState(){ return __state; }
function setState(patch){
  __state = Object.assign({}, __state, patch||{});
  __subs.forEach(fn => { try{ fn(__state); } catch(_){} });
}
function subscribe(fn){ __subs.push(fn); return ()=> __subs = __subs.filter(x => x !== fn); }

// ---------- RPC helper to background ---------
function rpc(action, payload){
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ action, payload }, (res) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (!res || res.ok !== true) return reject(new Error((res && res.error) || 'RPC failed'));
        resolve(res);
      });
    } catch (err) { reject(err); }
  });
}

// ---------- Name helpers ----------
function normalizeName(name){
  return String(name || '').replace(/[\s_]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}
function isValidName(name){
  return !!(name && name.trim() && name.trim().length >= 1);
}
function ensureUniqueName(baseName, existingNames){
  const set = new Set((existingNames || []).map(x => (x||'').toLowerCase()));
  let candidate = normalizeName(baseName);
  if (!set.has(candidate.toLowerCase())) return candidate;
  let i = 2;
  while (set.has((candidate + ' ' + i).toLowerCase())) i++;
  return candidate + ' ' + i;
}

// Generic CRUD store adapter to keep modules thin and consistent
// Expects RPC functions already implemented in background.js
function createCrudAdapter({ stateKey, listRpc, addRpc, updateRpc, deleteRpc }){
  if (!stateKey || !listRpc || !addRpc || !updateRpc || !deleteRpc) throw new Error('Invalid CRUD adapter params');
  return {
    async list(){ const res = await rpc(listRpc); return res.items || []; },
    async add(item){ const res = await rpc(addRpc, { item }); return res.items || []; },
    async update(id, item){ const res = await rpc(updateRpc, { id, item }); return res.items || []; },
    async remove(id){ const res = await rpc(deleteRpc, { id }); return res.items || []; }
  };
}

// ---------- Context Menu ----------
function installContextMenu(){
  const menu = document.getElementById('contextMenu');
  const items = document.getElementById('contextMenuItems');
  if (!menu || !items) return;
  document.addEventListener('contextmenu', (e) => {
    const data = e.target && e.target.closest && e.target.closest('[data-menu]');
    if (!data) return;
    e.preventDefault();
    items.innerHTML = '';
    try{
      const conf = JSON.parse(data.getAttribute('data-menu') || '[]');
      conf.forEach(it => {
        const li = el('li', { class: 'context-item' }, it.label);
        li.addEventListener('click', () => { try{ it.onClick && it.onClick(); }catch(_){ } menu.classList.add('hidden'); });
        items.appendChild(li);
      });
      menu.style.left = e.pageX + 'px';
      menu.style.top = e.pageY + 'px';
      menu.classList.remove('hidden');
    } catch(_){ /* noop */ }
  });
  document.addEventListener('click', () => menu.classList.add('hidden'));
}

// ---------- Theme toggle ----------
function installThemeToggle(){
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  const root = document.documentElement;
  btn.addEventListener('click', () => {
    const dark = root.classList.toggle('dark');
    showToast(dark ? 'Dark mode' : 'Light mode');
  });
}

// ---------- Global hotkeys (e.g., save) ----------
function installGlobalHotkeys(){
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){
      e.preventDefault();
      const saveBtn = document.querySelector('[data-primary-action="save"]');
      if (saveBtn) saveBtn.click();
    }
  });
}

// ---------- Simple Wizard Stepper ----------
function WizardStepper(steps){
  let idx = 0;
  const header = el('div', { class: 'wizard-header' }, ...steps.map((s, i) => el('div', { class: 'step ' + (i === 0 ? 'active' : '') }, s.title || ('Step ' + (i+1)))));
  const body = el('div', { class: 'wizard-body' }, steps[0] && steps[0].render ? steps[0].render() : el('div', {}, ''));
  function set(i){
    idx = Math.max(0, Math.min(steps.length-1, i));
    Array.from(header.children).forEach((c, j) => c.classList.toggle('active', j === idx));
    body.innerHTML = '';
    const view = steps[idx].render();
    body.appendChild(view);
  }
  return {
    el: el('div', { class: 'wizard' }, header, body),
    next(){ set(idx+1); },
    prev(){ set(idx-1); },
    set
  };
}

// Provide a U namespace for legacy app.js references
const U = { appEl, el, h, showToast, getState, setState, subscribe, rpc, normalizeName, isValidName, ensureUniqueName, createCrudAdapter, installContextMenu, installThemeToggle, installGlobalHotkeys, WizardStepper };

// =============================
// modules/expansions.js (inlined)
// =============================
const Expansions = (() => {
  const id = 'expansions';
  const title = 'Expansions';
  const store = createCrudAdapter({
    stateKey: 'expansions',
    listRpc: 'LIST_EXPANSIONS',
    addRpc: 'ADD_EXPANSION',
    updateRpc: 'UPDATE_EXPANSION',
    deleteRpc: 'DELETE_EXPANSION'
  });
  function render(){
    const s = getState();
    const list = (s.expansions || []);
    const names = list.map(x => x && x.trigger || '');
    function add(){
      const trigger = prompt('Trigger (e.g., :sig)');
      if (!isValidName(trigger)) return showToast('Invalid trigger', { tone: 'error' });
      const unique = ensureUniqueName(trigger, names);
      const replacement = prompt('Replacement text/template');
      store.add({ id: Date.now(), trigger: unique, replacement, type: 'text' })
        .then(items => setState({ expansions: items }))
        .catch(err => showToast('Add failed: ' + (err && err.message || err), { tone: 'error' }));
    }
    function row(it){
      return el('div', { class: 'row' },
        el('div', { class: 'cell' }, it.trigger),
        el('div', { class: 'cell' }, it.type || 'text'),
        el('div', { class: 'cell actions' },
          el('button', { onClick: () => edit(it) }, 'Edit'),
          el('button', { onClick: () => remove(it) }, 'Delete')
        )
      );
    }
    function edit(it){
      const trigger = prompt('Trigger', it.trigger);
      if (!isValidName(trigger)) return showToast('Invalid trigger', { tone: 'error' });
      const replacement = prompt('Replacement', it.replacement);
      store.update(it.id, { trigger, replacement })
        .then(items => setState({ expansions: items }))
        .catch(err => showToast('Update failed: ' + (err && err.message || err), { tone: 'error' }));
    }
    function remove(it){
      if (!confirm('Delete expansion ' + it.trigger + '?')) return;
      store.remove(it.id)
        .then(items => setState({ expansions: items }))
        .catch(err => showToast('Delete failed: ' + (err && err.message || err), { tone: 'error' }));
    }
    return el('div', {},
      el('div', { class: 'toolbar' },
        el('button', { onClick: add }, 'Add Expansion')
      ),
      el('div', { class: 'table' }, list.map(row))
    );
  }
  return { id, title, render };
})();

// =============================
// modules/forms.js (inlined)
// =============================
const Forms = (() => {
  const id = 'forms';
  const title = 'Forms';
  const store = createCrudAdapter({
    stateKey: 'forms',
    listRpc: 'LIST_FORMS',
    addRpc: 'ADD_FORM',
    updateRpc: 'UPDATE_FORM',
    deleteRpc: 'DELETE_FORM'
  });
  function render(){
    const s = getState();
    const list = (s.forms || []);
    const names = list.map(x => x && x.name || '');
    function add(){
      const name = prompt('Form name');
      if (!isValidName(name)) return showToast('Invalid name', { tone: 'error' });
      const unique = ensureUniqueName(name, names);
      const fields = prompt('Fields JSON (e.g., [{"label":"Your name","type":"text","var":"name"}])');
      let parsed = [];
      try { parsed = JSON.parse(fields || '[]'); } catch(_){ return showToast('Invalid JSON', { tone:'error' }); }
      store.add({ id: Date.now(), name: unique, fields: parsed })
        .then(items => setState({ forms: items }))
        .catch(err => showToast('Add failed: ' + (err && err.message || err), { tone: 'error' }));
    }
    function row(it){
      return el('div', { class: 'row' },
        el('div', { class: 'cell' }, it.name),
        el('div', { class: 'cell actions' },
          el('button', { onClick: () => edit(it) }, 'Edit'),
          el('button', { onClick: () => remove(it) }, 'Delete')
        )
      );
    }
    function edit(it){
      const name = prompt('Form name', it.name);
      const fields = prompt('Fields JSON', JSON.stringify(it.fields || []));
      let parsed = [];
      try { parsed = JSON.parse(fields || '[]'); } catch(_){ return showToast('Invalid JSON', { tone:'error' }); }
      store.update(it.id, { name, fields: parsed })
        .then(items => setState({ forms: items }))
        .catch(err => showToast('Update failed: ' + (err && err.message || err), { tone: 'error' }));
    }
    function remove(it){
      if (!confirm('Delete form ' + it.name + '?')) return;
      store.remove(it.id)
        .then(items => setState({ forms: items }))
        .catch(err => showToast('Delete failed: ' + (err && err.message || err), { tone: 'error' }));
    }
    return el('div', {},
      el('div', { class: 'toolbar' },
        el('button', { onClick: add }, 'Add Form')
      ),
      el('div', { class: 'table' }, list.map(row))
    );
  }
  return { id, title, render };
})();

// =============================
// modules/variables.js (inlined)
// =============================
const Variables = (() => {
  const id = 'variables';
  const title = 'Variables';
  const store = createCrudAdapter({
    stateKey: 'variables',
    listRpc: 'LIST_VARIABLES',
    addRpc: 'ADD_VARIABLE',
    updateRpc: 'UPDATE_VARIABLE',
    deleteRpc: 'DELETE_VARIABLE'
  });
  function render(){
    const s = getState();
    const list = (s.variables || []);
    const names = list.map(x => x && x.name || '');
    function add(){
      const name = prompt('Variable name');
      if (!isValidName(name)) return showToast('Invalid name', { tone: 'error' });
      const unique = ensureUniqueName(name, names);
      const type = prompt('Type (text, number, formatDate, option)');
      const def = prompt('Default');
      store.add({ id: Date.now(), name: unique, type, default: def })
        .then(items => setState({ variables: items }))
        .catch(err => showToast('Add failed: ' + (err && err.message || err), { tone: 'error' }));
    }
    function row(it){
      return el('div', { class: 'row' },
        el('div', { class: 'cell' }, it.name),
        el('div', { class: 'cell' }, it.type || 'text'),
        el('div', { class: 'cell actions' },
          el('button', { onClick: () => edit(it) }, 'Edit'),
          el('button', { onClick: () => remove(it) }, 'Delete')
        )
      );
    }
    function edit(it){
      const name = prompt('Variable name', it.name);
      const type = prompt('Type', it.type);
      const def = prompt('Default', it.default);
      store.update(it.id, { name, type, default: def })
        .then(items => setState({ variables: items }))
        .catch(err => showToast('Update failed: ' + (err && err.message || err), { tone: 'error' }));
    }
    function remove(it){
      if (!confirm('Delete variable ' + it.name + '?')) return;
      store.remove(it.id)
        .then(items => setState({ variables: items }))
        .catch(err => showToast('Delete failed: ' + (err && err.message || err), { tone: 'error' }));
    }
    return el('div', {},
      el('div', { class: 'toolbar' },
        el('button', { onClick: add }, 'Add Variable')
      ),
      el('div', { class: 'table' }, list.map(row))
    );
  }
  return { id, title, render };
})();

// =============================
// modules/prompts.js (inlined)
// =============================
const Prompts = (() => {
  const id = 'prompts';
  const title = 'AI Prompts';
  const store = createCrudAdapter({
    stateKey: 'prompts',
    listRpc: 'LIST_PROMPTS',
    addRpc: 'ADD_PROMPT',
    updateRpc: 'UPDATE_PROMPT',
    deleteRpc: 'DELETE_PROMPT'
  });
  function render(){
    const s = getState();
    const list = (s.prompts || []);
    const names = list.map(x => x && x.name || '');
    function add(){
      const name = prompt('Prompt name');
      const unique = ensureUniqueName(name, names);
      const body = prompt('Prompt body');
      store.add({ id: Date.now(), name: unique, body })
        .then(items => setState({ prompts: items }))
        .catch(err => showToast('Add failed: ' + (err && err.message || err), { tone: 'error' }));
    }
    function row(it){
      return el('div', { class: 'row' },
        el('div', { class: 'cell' }, it.name),
        el('div', { class: 'cell actions' },
          el('button', { onClick: () => edit(it) }, 'Edit'),
          el('button', { onClick: () => remove(it) }, 'Delete')
        )
      );
    }
    function edit(it){
      const name = prompt('Prompt name', it.name);
      const body = prompt('Body', it.body);
      store.update(it.id, { name, body })
        .then(items => setState({ prompts: items }))
        .catch(err => showToast('Update failed: ' + (err && err.message || err), { tone: 'error' }));
    }
    function remove(it){
      if (!confirm('Delete prompt ' + it.name + '?')) return;
      store.remove(it.id)
        .then(items => setState({ prompts: items }))
        .catch(err => showToast('Delete failed: ' + (err && err.message || err), { tone: 'error' }));
    }
    return el('div', {},
      el('div', { class: 'toolbar' },
        el('button', { onClick: add }, 'Add Prompt')
      ),
      el('div', { class: 'table' }, list.map(row))
    );
  }
  return { id, title, render };
})();

// =============================
// modules/settings.js (inlined)
// =============================
const Settings = (() => {
  const id = 'settings';
  const title = 'Settings';
  function render(){
    const s = getState();
    async function setArea(area){
      try{
        const res = await rpc('SET_STORAGE_AREA', { area });
        showToast('Storage: ' + res.area);
      } catch(err){ showToast('Failed: ' + (err && err.message || err), { tone: 'error' }); }
    }
    return el('div', {},
      el('div', { class: 'row' },
        el('div', { class: 'cell' }, 'Storage Area'),
        el('div', { class: 'cell' },
          el('button', { onClick: () => setArea('sync') }, 'Sync'),
          el('button', { onClick: () => setArea('local') }, 'Local')
        )
      )
    );
  }
  return { id, title, render };
})();

// =============================
// modules/help.js (inlined)
// =============================
const Help = (() => {
  const id = 'help';
  const title = 'Help';
  function render(){
    return el('div', {},
      el('h2', {}, 'Help'),
      el('p', {}, 'Use the Expansions, Variables, Forms, and AI Prompts tabs to configure the engine. Settings lets you switch storage area. Right-click rows for context actions.')
    );
  }
  return { id, title, render };
})();

// =============================
// app.js (inlined)
// =============================
const TABS = [Expansions, Variables, Forms, Prompts, Settings, Help];

function render(){
  const s = getState();
  const tab = (TABS.find(t => t.id === s.tab) || TABS[0]);
  const tabsBar = el('div', { class: 'tabs' },
    ...TABS.map(t => el('button', { class: 'tab' + (t.id === tab.id ? ' active' : ''), onClick: () => setState({ tab: t.id }) }, t.title))
  );
  const view = el('div', { class: 'view' }, tab.render());
  appEl().innerHTML = '';
  appEl().appendChild(el('div', { class: 'manager-root' }, tabsBar, view));
}

subscribe(render);

(async function init(){
  try {
    const res = await rpc('GET_STATE');
    const state = (res && res.state) || {};
    setState(Object.assign({ tab: 'expansions', data: {} }, state));
    installContextMenu();
    installThemeToggle();
    installGlobalHotkeys();
  } catch (err) {
    showToast('Failed to initialize manager: ' + (err && err.message || err), { tone: 'error' });
    // eslint-disable-next-line no-console
    console.error(err);
  }
})();
