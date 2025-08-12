// ui/app.js
import * as U from './utils.js';
import * as Expansions from './modules/expansions.js';
import * as Variables from './modules/variables.js';
import * as Forms from './modules/forms.js';
import * as Prompts from './modules/prompts.js';
import * as Settings from './modules/settings.js';
import * as Help from './modules/help.js';

const TABS = [Expansions, Variables, Forms, Prompts, Settings, Help];

function Sidebar(){
  const s = U.getState();
  const items = TABS.map(t => U.el('div', {
    class: 'side-item' + (s.tab === t.id ? ' active' : ''),
    onclick: ()=>{ U.setState({ tab: t.id }); location.hash = t.id; }
  }, t.label || t.id));
  return U.el('div', { class:'sidebar' }, ...items);
}

function Main(){
  const s = U.getState();
  const mod = TABS.find(t => t.id === s.tab) || Expansions;
  let view;
  try {
    view = mod.render();
  } catch (e){
    view = U.el('div', { class:'pad' }, 'Failed to render: ' + (e && e.message || e));
  }
  return U.el('div', { class:'main' }, view);
}

function Layout(){
  return U.withSidebar(Sidebar(), Main());
}

function render(){
  U.renderWithFocus(()=>{
    const root = U.appEl();
    root.innerHTML = '';
    root.appendChild(Layout());
  });
}

function applyRoute(){
  const id = (location.hash && location.hash.slice(1)) || 'expansions';
  U.setState({ tab: id });
}

async function initData(){
  // Pull initial state from background
  const st = await U.rpc('GET_STATE');
  // set defaults if needed
  const next = Object.assign({ tab:'expansions' }, st || {});
  U.setState(next);
}

function mountContextMenuHandlers(){
  // Close context menu when clicking outside
  document.addEventListener('click', (e)=>{
    const menuEl = document.getElementById('contextMenu');
    if (!menuEl) return;
    if (menuEl.classList.contains('hidden')) return;
    if (menuEl === e.target || menuEl.contains(e.target)) return;
    U.closeContextMenu();
  });
  document.addEventListener('contextmenu', (e)=>{
    if (!e.target.closest('.builder, .list')) return;
    e.preventDefault();
  });
}

async function boot(){
  U.injectTheme && U.injectTheme();
  await initData();
  applyRoute();
  render();
  U.subscribe(render);
  mountContextMenuHandlers();
}

window.addEventListener('hashchange', ()=>{ U.setState({ tab: (location.hash && location.hash.slice(1)) || 'expansions' }); });
boot().catch(err => U.showToast(String(err && err.message || err)));
