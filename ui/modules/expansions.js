// ui/modules/expansions.js
import { el, rpc, getState, setState, Toolbar, applyFilter, showToast, openContextMenu } from '../utils.js';
export const id = 'expansions';
export const label = 'Expansions';
function toolbar(){ return Toolbar({ buttons: [ el('button', { class:'btn', onclick: add }, 'Add Expansion') ] }); }
async function add(){ const { id } = await rpc('ADD_EXPANSION', { item: { trigger: ':new', replacement: 'New expansion', type: 'text' } }); await reload(); showToast('Added'); }
async function update(id, patch){ await rpc('UPDATE_EXPANSION', { id, patch }); }
async function remove(id){ await rpc('DELETE_EXPANSION', { id }); await reload(); showToast('Deleted'); }
async function reload(){ const st = await rpc('GET_STATE'); setState({ data: st.data }); }
function list(){ const items = applyFilter(getState().data.expansions || []); return el('div', { class:'grid cols-2 list' }, ...items.map(card)); }
function card(it){
  const cm = [
    { label:'Duplicate', onClick: async ()=>{ const copy = Object.assign({}, it, { id: undefined, trigger: (it.trigger||'')+'_copy' }); await rpc('ADD_EXPANSION', { item: copy }); await reload(); } },
    { label:'Delete', onClick: ()=> remove(it.id) }
  ];
  return el('div', { class:'card', oncontextmenu:(e)=>{ openContextMenu(e.pageX, e.pageY, cm); } },
    el('div', { class:'row between' },
      el('div', { class:'row' }, el('span', { class:'badge' }, it.type||'text'), el('span', { class:'small' }, `#${it.id}`)),
      el('div', {}, el('button', { class:'btn secondary', onclick: ()=>{} }, 'Edit'), el('button', { class:'btn secondary', onclick: ()=> remove(it.id) }, 'Delete'))
    ),
    el('div', { class:'row' }, el('input', { class:'input', value: it.trigger || '', placeholder: it.type === 'regex' ? 'Regex pattern below' : 'Trigger', oninput:(e)=> update(it.id, { trigger: e.target.value }) })),
    el('div', {}, el('textarea', { oninput:(e)=> update(it.id, { replacement: e.target.value }) }, it.replacement||'')),
    it.type === 'regex' ? el('div', {}, el('input', { class:'input', value: it.pattern || '', placeholder:'Regex pattern', oninput:(e)=> update(it.id, { pattern: e.target.value }) })) : null,
    el('div', { class:'row' },
      el('label', {}, 'Type'),
      el('select', { onchange:(e)=> update(it.id, { type: e.target.value }) },
        el('option', { value:'text', selected: it.type==='text' }, 'text'),
        el('option', { value:'regex', selected: it.type==='regex' }, 'regex')
      )
    )
  );
}
export function render(){
  const wrap = el('div', {});
  wrap.appendChild(el('div', { class:'card' }, el('h3', {}, 'Expansions')));
  wrap.appendChild(toolbar());
  wrap.appendChild(list());
  return wrap;
}
