// ui/utils.js
// Minimal reactive store, DOM helpers, modal, theme, sync utilities, and shared UI bits.

export const appEl = () => document.getElementById('app');

export function el(tag, attrs = {}, ...children){
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
    if (Array.isArray(c)) { 
      c.forEach(x => {
        if (x == null) return;
        if (x instanceof Node) { e.appendChild(x); }
        else { e.appendChild(document.createTextNode(String(x))); }
      });
      continue; 
    }
    e.appendChild(document.createTextNode(String(c)));
  }
  return e;
}

export function cls(elm, classes){
  if (!elm) return;
  Object.entries(classes || {}).forEach(([k,v]) => elm.classList.toggle(k, !!v));
}

export function $(sel, root=document){ return root.querySelector(sel); }
export function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

/* ---------- Toasts ---------- */
let toastSeq = 0;
export function showToast(msg, opts={}){
  const id = `tf-toast-${++toastSeq}`;
  const t = el('div', { class:'toast', id },
    el('div', { class:'toast-msg' }, msg),
  );
  document.body.appendChild(t);
  setTimeout(()=> t.classList.add('show'));
  const timeout = opts.timeout ?? 2200;
  setTimeout(()=> hideToast(id), timeout);
}

export function hideToast(id){
  const t = document.getElementById(id);
  if (!t) return;
  t.classList.remove('show');
  setTimeout(()=> t.remove(), 200);
}

/* ---------- Modal ---------- */
let modalId = 0;
export function modal({ title = '', content = '', buttons = [] } = {}){
  const id = `tf-modal-${++modalId}`;
  const overlay = el('div', { class:'modal-overlay', id, role:'dialog', 'aria-modal':'true' });
  const header = el('div', { class:'modal-header' },
    el('div', { class:'modal-title' }, title),
  );
  const body = el('div', { class:'modal-body' }, typeof content === 'string' ? el('div', { html: content }) : content);
  const left = el('div', { class:'row' }, el('button', { class:'btn', onClick:()=> closeModal(id) }, 'Close'));
  const right = el('div', { class:'row' }, ...(buttons||[]));
  const footer = el('div', { class:'modal-footer' }, left, el('div', { class:'flex-1' }), right);

  overlay.appendChild(el('div', { class:'modal' }, header, body, footer));
  overlay.addEventListener('click', (e)=> { if (e.target === overlay) closeModal(id); });
  document.body.appendChild(overlay);
  requestAnimationFrame(()=> overlay.classList.add('show'));
  return id;
}

export function closeModal(id){
  const ely = document.getElementById(id);
  if (!ely) return;
  ely.classList.remove('show');
  setTimeout(()=> ely.remove(), 150);
}

/* ---------- Simple Store ---------- */
export function createStore(initial){
  let state = structuredClone(initial);
  /** @type {Set<Function>} */
  const subs = new Set();

  const get = () => state;
  const set = (patch) => {
    const next = typeof patch === 'function' ? patch(structuredClone(state)) : patch;
    state = Object.freeze({ ...state, ...next });
    subs.forEach(fn => {
      try { fn(state); } catch(err){ console.error('subscriber error', err); }
    });
  };
  const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };

  return Object.freeze({ get, set, subscribe });
}

/* ---------- Theme ---------- */
export function setTheme(theme){
  const root = document.documentElement;
  root.dataset.theme = theme;
  try { localStorage.setItem('tf_theme', theme); } catch {}
}

export function initTheme(){
  try {
    const t = localStorage.getItem('tf_theme');
    if (t) setTheme(t);
  } catch {}
}

/* ---------- Sync Helpers ---------- */
export async function pushSyncState(key, value){
  try {
    await chrome.storage.sync.set({ [key]: value });
    showToast('Sync: pushing...');
  } catch (e){
    console.error('pushSyncState error', e);
    showToast('Sync error');
  }
}

export async function pullSyncState(key){
  try {
    const data = await chrome.storage.sync.get(key);
    showToast('Sync: pulling...');
    return data?.[key];
  } catch (e){
    console.error('pullSyncState error', e);
    showToast('Sync error');
  }
}

/* ---------- Search Filter ---------- */
export function makeFilterInput(onChange){
  return el('input', { 
    class:'input', 
    type:'search', 
    placeholder:'Filter...', 
    onInput:(e)=> onChange?.(e.target.value)
  });
}

/* ---------- Context Menu ---------- */
let ctxMenuShowing = false;
export function contextMenu(items = [], { x=0, y=0 } = {}){
  closeContextMenu();
  const menu = el('div', { class:'context-menu', id:'contextMenu', style:`top:${y}px;left:${x}px;` },
    el('ul', { id:'contextMenuItems' }, ...items.map(it => el('li', {}, it)))
  );
  document.body.appendChild(menu);
  requestAnimationFrame(()=> menu.classList.add('show'));
  ctxMenuShowing = true;
}

document.addEventListener('click', ()=> { if (ctxMenuShowing) { closeContextMenu(); ctxMenuShowing = false; } });

/* ---------- Chrome messaging wrapper ---------- */
export async function rpc(type, payload){
  try {
    const res = await chrome.runtime.sendMessage({ action: type, type, ...(payload||{}) });
    if (res?.error) throw new Error(res.error);
    return res;
  } catch (e){
    console.error('rpc error', e);
    showToast('Action failed');
    return { error: String(e?.message || e) };
  }
}

/* ---------- Utilities ---------- */
export function copyToClipboard(text){
  try {
    navigator.clipboard.writeText(text);
    showToast('Copied');
  } catch(e){
    console.error('copyToClipboard error', e);
    showToast('Copy failed');
  }
}

export function debounce(fn, wait=150){
  let t; return (...args)=>{ clearTimeout(t); t = setTimeout(()=> fn(...args), wait); };
}

export function formatDate(dateStr, fmt = 'YYYY-MM-DD'){
  const d = dateStr ? new Date(dateStr) : new Date();
  const pad = (n)=> String(n).padStart(2, '0');
  const map = {
    YYYY: d.getFullYear(),
    MM: pad(d.getMonth()+1),
    DD: pad(d.getDate()),
    hh: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
  };
  return fmt.replace(/YYYY|MM|DD|hh|mm|ss/g, (k)=> map[k]);
}

export function uid(prefix='id'){
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function pluck(obj, path, fallback){
  try {
    const parts = Array.isArray(path) ? path : String(path).split('.');
    let cur = obj;
    for (const p of parts){
      if (cur == null) return fallback;
      cur = cur[p];
    }
    return cur ?? fallback;
  } catch {
    return fallback;
  }
}

export function ensureUniqueName(baseName, existingNames){
  const set = new Set((existingNames||[]).map(String));
  if (!set.has(baseName)) return baseName;
  for (let i=2; i<10_000; i++){
    const candidate = `${baseName} (${i})`;
    if (!set.has(candidate)) return candidate;
  }
  // Fallback if somehow exhausted
  return `${baseName}-${Math.random().toString(36).slice(2,6)}`;
}

/* ---------- Keyboard helpers ---------- */
export function onKey(elm, key, handler){
  elm.addEventListener('keydown', (e)=> {
    const want = Array.isArray(key) ? key : [key];
    if (want.includes(e.key)) handler(e);
  });
}

/* ---------- File helpers ---------- */
export function downloadText(filename, text){
  const blob = new Blob([text], { type:'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href:url, download:filename });
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

export function uploadText(accept='.json'){
  return new Promise((resolve, reject) => {
    const input = el('input', { type:'file', accept });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error('No file')); return; }
      try {
        const text = await file.text();
        resolve({ name:file.name, text });
      } catch(e){
        reject(e);
      }
    });
    input.click();
  });
}

/* ---------- Layout & Render helpers expected by app.js ---------- */
export function section(title, ...nodes){
  return el('section', { class:'section' },
    el('header', { class:'section-header' },
      el('h2', {}, title)
    ),
    el('div', { class:'section-body' }, ...nodes)
  );
}

export function rows(...rowNodes){
  return el('div', { class:'rows' }, ...rowNodes);
}

export function row(label, control){
  return el('div', { class:'row' }, el('label', { class:'label' }, label), control);
}

export function btn(label, attrs = {}){
  return el('button', { class:'btn', ...attrs }, label);
}

export function tag(text){
  return el('span', { class:'tag' }, text);
}

export function select(options = [], attrs = {}){
  const sel = el('select', { class:'input', ...attrs }, ...options.map(([val, lab]) => el('option', { value: val }, lab)));
  return sel;
}

export function checkbox(label, attrs = {}){
  const id = uid('chk');
  const input = el('input', { type:'checkbox', id, class:'checkbox', ...attrs });
  const lab = el('label', { for:id, class:'label-inline' }, label);
  return el('div', { class:'row' }, input, lab);
}

export function textInput(attrs = {}){
  const input = el('input', { class:'input', type:'text', ...attrs });
  return input;
}

export function confirmDialog(message, { okText='OK', cancelText='Cancel' } = {}){
  return new Promise((resolve) => {
    const okBtn = btn(okText, { class:'btn primary' });
    const cancelBtn = btn(cancelText);

    okBtn.addEventListener('click', () => { closeModal(mid); resolve(true); });
    cancelBtn.addEventListener('click', () => { closeModal(mid); resolve(false); });

    const mid = modal({
      title: 'Confirm',
      content: el('div', {}, el('p', {}, message)),
      buttons: [cancelBtn, okBtn]
    });
  });
}

export function renderEmptyState(text){
  return el('div', { class:'empty' }, text);
}

export function injectTheme(){
  // No-op placeholder; can be extended to toggle theme variables.
  // Kept to satisfy existing calls without changing behavior.
}

export function closeContextMenu(){
  const menu = document.getElementById('contextMenu');
  if (!menu) return;
  menu.classList.add('hidden');
  const list = document.getElementById('contextMenuItems');
  if (list) list.innerHTML = '';
}


// === CHANGELOG ===
// 2025-08-12: Fixed malformed children array handling in el() that contained an ellipsis placeholder.
// The new logic iterates children arrays and appends Node items directly, or wraps primitives in Text nodes.
// No other logic changed.
