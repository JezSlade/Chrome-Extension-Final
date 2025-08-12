// ui/utils.js
export const appEl = () => document.getElementById('app');
export function el(tag, attrs = {}, ...children){
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)){
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for (const c of children){ if (c == null) continue; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
  return e;
}
export async function rpc(type, payload){
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (!res || !res.ok) throw new Error((res && res.error) || 'RPC failed');
  return res;
}
const store = {
  state: { tab: (location.hash && location.hash.slice(1)) || 'expansions', data: null, prompts: null, menu: null, filter: '', toast: null },
  set(p){ this.state = Object.assign({}, this.state, p); },
  get(){ return this.state; }
};
export const getState = () => store.get();
export const setState = (p) => store.set(p);
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
export function injectTheme(){
  if (document.getElementById('tf-theme')) return;
  const css = `
:root{ --tf-accent:#6aa9ff; --tf-accent-2:#a78bfa; --tf-glass-bg:rgba(255,255,255,0.88); --tf-glass-blur:saturate(1.3) blur(6px); }
.tab{ background:rgba(255,255,255,0.86); }
.tab.active{ background:linear-gradient(135deg, var(--tf-glass-bg), #ffffff); border-color:rgba(0,0,0,.14); }
.btn{ background:linear-gradient(135deg, var(--tf-accent), var(--tf-accent-2)); border:0; color:#fff; }
.btn.secondary{ background:linear-gradient(135deg,#475569,#1f2937); color:#fff; }
.card{ background:rgba(255,255,255,.96); backdrop-filter:var(--tf-glass-blur); border:1px solid rgba(0,0,0,.16); box-shadow:0 8px 24px rgba(0,0,0,.08); }
.badge{ background:rgba(106,169,255,.18); color:#1e40af; }
.field.drag-over{ outline:2px dashed var(--tf-accent); outline-offset:2px; }
.input, select, textarea{ background:#fff; border:1px solid rgba(0,0,0,.2); }
.input:focus, select:focus, textarea:focus{ outline:3px solid rgba(106,169,255,.35); border-color:rgba(106,169,255,.6); }
.canvas{ border-color:rgba(37,99,235,0.62); }
.palette .item{ border-color:rgba(0,0,0,.28); }
.palette .item:hover{ background:rgba(255,255,255,.96); }
#contextMenu{ position:absolute; z-index:9999; background:rgba(255,255,255,.98); backdrop-filter:var(--tf-glass-blur); border:1px solid rgba(0,0,0,.16); border-radius:10px; padding:6px; box-shadow:0 10px 28px rgba(0,0,0,.12); }
#contextMenu.hidden{ display:none; }
#contextMenu ul{ list-style:none; margin:0; padding:0; }
#contextMenu li{ padding:6px 10px; cursor:pointer; border-radius:8px; }
#contextMenu li:hover{ background:rgba(106,169,255,.18); }
`;
  const style = document.createElement('style');
  style.id = 'tf-theme';
  style.textContent = css;
  document.head.appendChild(style);
}
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
export function Toolbar(actions){
  const s = getState();
  return el('div', { class:'row between' },
    el('input', { class:'input', placeholder:'Filter...', value: s.filter, oninput:(e)=>{ setState({ filter: e.target.value }); if (actions && actions.onFilter) actions.onFilter(e.target.value); } }),
    el('div', { class:'row' }, ...(actions && actions.buttons ? actions.buttons : []))
  );
}
export function applyFilter(list){
  const q = (getState().filter || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter(x => JSON.stringify(x).toLowerCase().includes(q));
}
export const uid = () => Math.floor(Math.random()*1e9);
