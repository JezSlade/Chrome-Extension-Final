export function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of (Array.isArray(children) ? children : [children])) {
    if (c) e.appendChild(c);
  }
  return e;
}
export const msg = (type, payload = {}) => new Promise((resolve)=> {
  chrome.runtime.sendMessage({ type, ...payload }, resolve);
});
export async function loadState() {
  const res = await msg('GET_STATE');
  if (!res.ok) throw new Error(res.error || 'Failed to get state');
  return res.state;
}
export async function saveState(next) {
  const res = await msg('SET_STATE', { state: next });
  if (!res.ok) throw new Error(res.error || 'Persist failed');
}
export function toast(txt, kind='ok') {
  const t = el('div', { class: 'toast', role: 'status' }, txt);
  document.body.appendChild(t);
  setTimeout(()=> t.remove(), 2000);
}
export function byId(id) { return document.getElementById(id); }
