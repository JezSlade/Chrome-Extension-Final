// ui/modules/settings.js
import { el, rpc, getState, setState, Toolbar, showToast } from '../utils.js';
export const id = 'settings';
export const label = 'Settings';
async function setMenu(menu){
  await rpc('SET_MENU', { menu });
  const m = await rpc('GET_MENU');
  setState({ menu: m.menu });
  showToast('Menu updated');
}
function toggle(label, val, on){ return el('label', {}, el('input', { type:'checkbox', checked: !!val, onchange:(e)=> on(!!e.target.checked) }), ' ', label); }
export function render(){
  const menu = getState().menu || { enableContextMenu:true, items:{ openManager:true, insertExpansion:true, promptEngineer:true } };
  const root = el('div', { class:'card' }, el('h3', {}, 'Settings'));
  const row1 = el('div', { class:'row' }, el('label', {}, 'Enable right click menu'), el('input', { type:'checkbox', checked: !!menu.enableContextMenu, onchange:(e)=> setMenu({ enableContextMenu: !!e.target.checked, items: menu.items }) }));
  const list = el('div', { class:'grid cols-3' },
    toggle('Open Manager', !!menu.items.openManager, v => setMenu({ items: Object.assign({}, menu.items, { openManager: v }) })),
    toggle('Insert Expansion', !!menu.items.insertExpansion, v => setMenu({ items: Object.assign({}, menu.items, { insertExpansion: v }) })),
    toggle('Prompt Engineer', !!menu.items.promptEngineer, v => setMenu({ items: Object.assign({}, menu.items, { promptEngineer: v }) }))
  );
  root.appendChild(row1);
  root.appendChild(el('div', { class:'row' }, el('label', {}, 'Menu items')));
  root.appendChild(list);
  root.appendChild(el('hr'));
  root.appendChild(el('div', { class:'small' }, 'Changes apply immediately.'));
  return root;
}
