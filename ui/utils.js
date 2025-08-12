// ui/utils.js
// Minimal reactive store, DOM helpers, modal, theme, and shared UI bits.

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
    toast: null
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

/* ---------- Modal ---------- */
export function openModal(opts){
  const { title, body, actions } = opts || {};
  const backdrop = el('div', { class: 'modal-backdrop', id: 'tf-modal' });
  const modal = el('div', { class: 'modal glass' });
  const header = el('div', { class: 'modal-header' },
    el('h3', {}, title || 'Edit'),
    el('button', { class:'btn secondary', onclick: closeModal }, 'Close')
  );
  const content = el('div', { class: 'modal-body' });
  if (body) content.appendChild(body);
  const footer = el('div', { class: 'modal-footer' });
  if (Array.isArray(actions)) actions.forEach(a => footer.appendChild(a));
  modal.appendChild(header);
  modal.appendChild(content);
  modal.appendChild(footer);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  setTimeout(()=> backdrop.classList.add('show'), 0);
  try { modal.querySelector('textarea, input, select')?.focus(); } catch {}
}
export function closeModal(){
  const node = document.getElementById('tf-modal');
  if (!node) return;
  node.classList.remove('show');
  setTimeout(()=> node.remove(), 120);
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
.tab{ display:none; } /* old top tabs hidden */
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

/* ---------- Toolbar and helpers ---------- */
export function Toolbar(actions){
  const s = getState();
  return el('div', { class:'row between' },
    el('input', {
      class:'input',
      placeholder:'Filter...',
      value: s.filter,
      'data-focus-key':'tf-filter',
      oninput:(e)=>{ setState({ filter: e.target.value }); }
    }),
    el('div', { class:'row' }, ...(actions && actions.buttons ? actions.buttons : []))
  );
}
export function applyFilter(list){
  const q = (getState().filter || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter(x => JSON.stringify(x).toLowerCase().includes(q));
}
export const uid = () => Math.floor(Math.random()*1e9);
