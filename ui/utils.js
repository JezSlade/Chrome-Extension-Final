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
    e.appendChild(document.createTextNode(String(c)));
  }
  return e;
}

export async function rpc(type, payload){
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (!res || !res.ok) throw new Error((res && res.error) || 'RPC failed');
  return res;
}

/* ---------- Reactive store ---------- */
const subscribers = new Set();
const store = {
  state: {
    tab: (location.hash && location.hash.slice(1)) || 'expansions',
    data: null,
    prompts: null,
    menu: null,
    promptData: null,
    filter: '',
    toast: null,
    // sync status visible in Toolbar and Settings
    sync: {
      phase: 'idle',   // idle | pushing | pulling
      last: null       // { action:'push'|'pull', ok:boolean, at:number, details?:string }
    }
  },
  set(p){
    this.state = Object.assign({}, this.state, p || {});
    for (const fn of subscribers) {
      try { fn(this.state); } catch {}
    }
  },
  get(){ return this.state; }
};

export const getState = () => store.get();
export const setState = (p) => store.set(p);
export const subscribe = (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); };

/* ---------- Focus preservation during re-render ---------- */
function captureFocusMarker(){
  const a = document.activeElement;
  if (!a) return null;
  const key = a.getAttribute && a.getAttribute('data-focus-key');
  if (!key) return null;
  let pos = null;
  try {
    if (typeof a.selectionStart === 'number' && typeof a.selectionEnd === 'number') {
      pos = { start: a.selectionStart, end: a.selectionEnd };
    }
  } catch {}
  return { key, pos };
}
function restoreFocusMarker(marker){
  if (!marker) return;
  const elTarget = document.querySelector(`[data-focus-key="${marker.key}"]`);
  if (!elTarget) return;
  try {
    elTarget.focus();
    if (marker.pos && typeof elTarget.setSelectionRange === 'function') {
      elTarget.setSelectionRange(marker.pos.start, marker.pos.end);
    }
  } catch {}
}
export function renderWithFocus(fn){
  const marker = captureFocusMarker();
  try { fn(); } finally { restoreFocusMarker(marker); }
}

/* ---------- Toast ---------- */
export function showToast(msg){
  setState({ toast: msg });
  renderToast();
  setTimeout(()=>{ setState({ toast: null }); renderToast(); }, 1600);
}
function renderToast(){
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const s = getState();
  if (!s.toast) return;
  document.body.appendChild(el('div', { class:'toast' }, s.toast));
}

/* ---------- Modal (stacked) ---------- */
let modalSeq = 0;
const modalStack = [];

/**
 * Open a modal dialog.
 * Stacks multiple modals. Backdrop click and Escape close topmost only.
 */
export function openModal(opts){
  const { title, body, actions } = opts || {};
  const id = `tf-modal-${++modalSeq}`;

  const backdrop = el('div', { class: 'modal-backdrop', id });
  const modal = el('div', { class: 'modal glass', role: 'dialog', 'aria-modal': 'true' });

  modal.addEventListener('click', (e)=> e.stopPropagation());

  const onBackdropClick = (e) => {
    if (e.target === backdrop && modalStack.length && modalStack[modalStack.length - 1] === backdrop){
      closeModal(backdrop);
    }
  };
  backdrop.addEventListener('click', onBackdropClick);

  const onKey = (e) => {
    if (e.key === 'Escape' && modalStack.length && modalStack[modalStack.length - 1] === backdrop){
      closeModal(backdrop);
    }
  };
  document.addEventListener('keydown', onKey);

  const header = el('div', { class: 'modal-header' },
    el('h3', {}, title || 'Edit'),
    el('button', { class:'btn secondary', onclick: ()=> closeModal(backdrop) }, 'Close')
  );
  const content = el('div', { class: 'modal-body' });
  if (body) content.appendChild(body);
  const footer = el('div', { class: 'modal-footer' });
  if (Array.isArray(actions)) actions.forEach(a => footer.appendChild(a));

  modal.appendChild(header);
  modal.appendChild(content);
  modal.appendChild(footer);
  backdrop.appendChild(modal);

  backdrop._escHandler = onKey;
  backdrop._clickHandler = onBackdropClick;

  modalStack.push(backdrop);
  document.body.appendChild(backdrop);

  setTimeout(()=> backdrop.classList.add('show'), 0);
  try { modal.querySelector('textarea, input, select')?.focus(); } catch {}
}

/** Close a specific modal or the topmost one. */
export function closeModal(target){
  let backdrop = null;
  if (target instanceof Node) {
    backdrop = target.closest('.modal-backdrop');
  }
  if (!backdrop) {
    backdrop = modalStack.pop();
  } else {
    const i = modalStack.indexOf(backdrop);
    if (i >= 0) modalStack.splice(i, 1);
  }
  if (!backdrop) return;

  if (backdrop._escHandler) document.removeEventListener('keydown', backdrop._escHandler);
  if (backdrop._clickHandler) backdrop.removeEventListener('click', backdrop._clickHandler);

  backdrop.classList.remove('show');
  setTimeout(()=> backdrop.remove(), 120);
}

/* ---------- Theme ---------- */
export function injectTheme(){
  if (document.getElementById('tf-theme')) return;
  const css = `
:root{
  --tf-accent:#6aa9ff;
  --tf-accent-2:#a78bfa;
  --tf-bg-1:#0f172a;
  --tf-bg-2:#1f2937;
  --tf-card:#1f2937;
  --tf-text:#e5e7eb;
  --tf-text-weak:#9ca3af;
  --tf-focus: rgba(59,130,246,.35);
}
.tab{ display:none; }
`;
  const style = document.createElement('style');
  style.id = 'tf-theme';
  style.textContent = css;
  document.head.appendChild(style);
}

/* ---------- Context menu helpers ---------- */
export function openContextMenu(x, y, items){
  const menu = document.getElementById('contextMenu');
  const list = document.getElementById('contextMenuItems');
  if (!menu || !list) return;
  list.innerHTML = '';
  for (const it of items){
    list.appendChild(el('li', { onclick: ()=>{ it.onClick(); closeContextMenu(); } }, it.label));
  }
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.remove('hidden');
}
export function closeContextMenu(){
  const menu = document.getElementById('contextMenu');
  if (menu) menu.classList.add('hidden');
}

/* ---------- Wizard Stepper (shared) ---------- */
export function WizardStepper(steps, current){
  return el('div', { class:'stepper' },
    ...steps.map(s => el('div', { class:'step' + (current === s.n ? ' active' : '') }, `${s.n}. ${s.label}`))
  );
}

/* ---------- Toolbar and helpers ---------- */
export function Toolbar(cfg){
  const s = getState();
  const right = el('div', { class:'row' }, ...(cfg && cfg.buttons ? cfg.buttons : []));
  const sync = s.sync || {};
  const label = sync.phase === 'pushing'
    ? 'Sync: pushing...'
    : sync.phase === 'pulling'
      ? 'Sync: pulling...'
      : (sync.last ? `Last sync: ${new Date(sync.last.at).toLocaleString()} ${sync.last.ok ? '✓' : '✕'}` : 'No sync yet.');
  right.appendChild(el('div', { class:'small', style:'margin-left:8px' }, label));

  return el('div', { class:'row between' },
    el('input', {
      class:'input',
      placeholder:'Filter...',
      value: s.filter,
      'data-focus-key':'tf-filter',
      oninput:(e)=>{ setState({ filter: e.target.value }); }
    }),
    right
  );
}
export function applyFilter(list){
  const q = (getState().filter || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter(x => JSON.stringify(x).toLowerCase().includes(q));
}
export const uid = () => Math.floor(Math.random()*1e9);

/* ---------- Markdown editor (Quick Formatting) ---------- */
function wrapSelection(t, before, after=''){
  const s = t.selectionStart || 0, e = t.selectionEnd || 0;
  const val = t.value;
  const pre = val.slice(0, s);
  const mid = val.slice(s, e);
  const post = val.slice(e);
  const ins = before + (mid || 'text') + (after || '');
  const pos = pre.length + before.length + (mid ? mid.length : 4);
  t.value = pre + ins + post;
  t.focus();
  t.setSelectionRange(pos, pos);
  t.dispatchEvent(new Event('input', { bubbles:true }));
}
function prefixLines(t, prefix){
  const s = t.selectionStart || 0, e = t.selectionEnd || 0;
  const val = t.value;
  const pre = val.slice(0, s);
  const mid = val.slice(s, e);
  const post = val.slice(e);
  const block = mid || 'item';
  const out = block.split('\n').map(line => line ? `${prefix}${line}` : `${prefix}`).join('\n');
  const pos = pre.length + out.length;
  t.value = pre + out + post;
  t.focus();
  t.setSelectionRange(pos, pos);
  t.dispatchEvent(new Event('input', { bubbles:true }));
}
export function MarkdownEditor(opts){
  const { value='', placeholder='', oninput, readonly=false, focusKey } = opts || {};
  const attrs = { class:'input big', placeholder, 'data-focus-key': focusKey };
  if (readonly) attrs.readonly = '';
  const ta = el('textarea', attrs, value);
  if (typeof oninput === 'function'){
    ta.addEventListener('input', (e)=> oninput(e.target.value));
  }
  const bar = el('div', { class:'md-toolbar row' },
    el('button', { class:'btn secondary md', onclick: ()=> wrapSelection(ta, '**','**') }, 'B'),
    el('button', { class:'btn secondary md', onclick: ()=> wrapSelection(ta, '*','*') }, 'I'),
    el('button', { class:'btn secondary md', onclick: ()=> prefixLines(ta, '## ') }, 'H2'),
    el('button', { class:'btn secondary md', onclick: ()=> prefixLines(ta, '- ') }, 'List'),
    el('button', { class:'btn secondary md', onclick: ()=> wrapSelection(ta, '`','`') }, 'Code'),
    el('button', { class:'btn secondary md', onclick: ()=> wrapSelection(ta, '[','](https://)') }, 'Link')
  );
  const wrap = el('div', {}, bar, ta);
  // expose textarea to callers that need insertion at cursor
  wrap._textarea = ta;
  return wrap;
}

/* ---------- Sync helpers (shared) ---------- */
function debounce(fn, wait){
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
async function persistLastSync(last){
  try { chrome.storage.sync.set({ tf_last_sync: last }); } catch {}
}
async function doPush(){
  const cur = getState().sync || {};
  setState({ sync: Object.assign({}, cur, { phase: 'pushing' }) });
  let ok = false, details = '';
  try {
    const res = await chrome.runtime.sendMessage({ type: 'SYNC_PUSH' });
    ok = !!(res && res.ok);
    details = (res && (res.details || res.message)) || '';
  } catch (e){
    details = e && e.message || 'push error';
  }
  const last = { action:'push', ok, at: Date.now(), details };
  await persistLastSync(last);
  setState({ sync: { phase: 'idle', last } });
}
async function doPull(){
  const cur = getState().sync || {};
  setState({ sync: Object.assign({}, cur, { phase: 'pulling' }) });
  let ok = false, details = '';
  try {
    const res = await chrome.runtime.sendMessage({ type: 'SYNC_PULL' });
    ok = !!(res && res.ok);
    details = (res && (res.details || res.message)) || '';
  } catch (e){
    details = e && e.message || 'pull error';
  }
  const last = { action:'pull', ok, at: Date.now(), details };
  await persistLastSync(last);
  setState({ sync: { phase: 'idle', last } });
}
export const triggerAutoSyncPush = debounce(doPush, 700);
export const triggerAutoSyncPull = debounce(doPull, 50);

export function loadSyncStatus(){
  try {
    chrome.storage.sync.get('tf_last_sync', (obj)=>{
      if (obj && obj.tf_last_sync){
        const last = obj.tf_last_sync;
        const cur = getState().sync || {};
        setState({ sync: Object.assign({}, cur, { last }) });
      }
    });
  } catch {}
}
// load status and pull once at boot for persistence across reloads
loadSyncStatus();
try {
  if (!window.__tf_sync_boot_pulled){
    window.__tf_sync_boot_pulled = true;
    triggerAutoSyncPull();
  }
} catch {}

/* ---------- Sidebar layout helper ---------- */
export function withSidebar(sidebarEl, mainEl){
  return el('div', { class:'grid cols-sidebar' },
    el('div', {}, sidebarEl),
    el('div', {}, mainEl)
  );
}
