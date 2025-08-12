// ui/app.js
import { appEl, el, rpc, getState, setState, injectTheme, showToast, closeContextMenu } from './utils.js';
import * as Expansions from './modules/expansions.js';
import * as Variables from './modules/variables.js';
import * as Forms from './modules/forms.js';
import * as Prompts from './modules/prompts.js';
import * as Settings from './modules/settings.js';
import * as Help from './modules/help.js';
const TABS = [Expansions, Variables, Forms, Prompts, Settings, Help];
function Nav(){
  const s = getState();
  const items = TABS.map(t => el('div', {
    class: 'tab' + (s.tab === t.id ? ' active' : ''),
    onclick: ()=>{ setState({ tab: t.id }); location.hash = t.id; render(); }
  }, t.label));
  return el('div', { class: 'nav' }, ...items);
}
async function load(){
  const st = await rpc('GET_STATE');
  const pr = await rpc('LIST_PROMPTS');
  const menu = await rpc('GET_MENU');
  setState({ data: st.data, prompts: pr.items, menu: menu.menu });
}
export function render(){
  const root = appEl();
  if (!root) return;
  root.innerHTML = '';
  closeContextMenu();
  root.appendChild(Nav());
  const tab = TABS.find(t => t.id === getState().tab) || Variables;
  root.appendChild(tab.render());
}
async function boot(){
  injectTheme();
  await load();
  render();
  document.addEventListener('click', (e)=>{
    const menuEl = document.getElementById('contextMenu');
    if (!menuEl) return;
    if (menuEl.classList.contains('hidden')) return;
    if (menuEl === e.target || menuEl.contains(e.target)) return;
    closeContextMenu();
  });
  document.addEventListener('contextmenu', (e)=>{
    if (!e.target.closest('.builder, .list')) return;
    e.preventDefault();
  });
}
window.addEventListener('hashchange', ()=>{ setState({ tab: (location.hash && location.hash.slice(1)) || 'expansions' }); render(); });
boot().catch(err => showToast(String(err && err.message || err)));
