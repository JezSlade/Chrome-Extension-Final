// ui/app.js
import { appEl, el, rpc, getState, setState, subscribe, renderWithFocus, injectTheme, showToast, closeContextMenu } from './utils.js';
import * as Expansions from './modules/expansions.js';
import * as Variables from './modules/variables.js';
import * as Forms from './modules/forms.js';
import * as Prompts from './modules/prompts.js';
import * as Settings from './modules/settings.js';
import * as Help from './modules/help.js';

const TABS = [Expansions, Variables, Forms, Prompts, Settings, Help];

function Sidebar(){
  const s = getState();
  const items = TABS.map(t => el('div', {
    class: 'side-item' + (s.tab === t.id ? ' active' : ''),
    onclick: ()=>{ setState({ tab: t.id }); location.hash = t.id; }
  }, t.label));
  return el('div', { class:'sidebar glass-dark' },
    el('div', { class:'side-header' }, 'ToolForge'),
    el('div', { class:'side-items' }, ...items)
  );
}

export function render(){
  const root = appEl();
  if (!root) return;
  renderWithFocus(() => {
    root.innerHTML = '';
    closeContextMenu();
    const tab = TABS.find(t => t.id === getState().tab) || Variables;
    const layout = el('div', { class:'layout' },
      Sidebar(),
      el('div', { class:'main glass' },
        el('div', { class:'main-inner' }, tab.render())
      )
    );
    root.appendChild(layout);
  });
}

async function load(){
  const st = await rpc('GET_STATE');
  const pr = await rpc('LIST_PROMPTS');
  const menu = await rpc('GET_MENU');
  const tpl = await rpc('GET_PROMPT_DATA'); // preload templates for wizard
  setState({ data: st.data, prompts: pr.items, menu: menu.menu, promptData: tpl.data });
}

async function boot(){
  injectTheme();
  await load();
  render();
  // Subscribe the renderer to all state changes
  subscribe(() => render());
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

window.addEventListener('hashchange', ()=>{ setState({ tab: (location.hash && location.hash.slice(1)) || 'expansions' }); });
boot().catch(err => showToast(String(err && err.message || err)));
