// ui/modules/expansions.js
import { el, rpc, getState, setState, Toolbar, applyFilter, showToast, openContextMenu } from '../utils.js';

export const id = 'expansions';
export const label = 'Expansions';

// Local UI state for the composer wizard
let wizard = {
  open: false,
  editingId: null,
  elements: [], // [{type:'text'|'input'|'variable', value:'', label?:''}]
  step: 1
};

function toolbar(){
  return Toolbar({
    buttons: [
      el('button', { class:'btn', onclick: startNew }, 'New Expansion')
    ]
  });
}

function startNew(){
  wizard = { open: true, editingId: null, elements: [], step: 1 };
  setState({}); // trigger re-render
}

async function editExisting(exp){
  // If composer exists use it, otherwise seed from replacement
  const base = Array.isArray(exp.composer) && exp.composer.length
    ? exp.composer
    : [{ type: 'text', value: String(exp.replacement || '') }];
  wizard = { open: true, editingId: exp.id, elements: base.map(x => ({...x})), step: 1 };
  setState({});
}

function buildReplacement(){
  // Map elements to template pieces
  return wizard.elements.map(item=>{
    if (item.type === 'text') return item.value || '';
    if (item.type === 'input') return `{{input:${item.label || 'Input'}}}`;
    if (item.type === 'variable') return item.value ? `{{${item.value}}}` : '';
    if (item.type === 'clipboard') return `{{clipboard}}`;
    if (item.type === 'date') return `{{date:+${item.format || '%Y-%m-%d'}}}`;
    if (item.type === 'uuid') return `{{uuid}}`;
    return '';
  }).join('');
}

async function saveWizard(){
  const rep = buildReplacement();
  if (!rep.trim()){
    showToast('Nothing to save');
    return;
  }
  if (wizard.editingId){
    await rpc('UPDATE_EXPANSION', { id: wizard.editingId, patch: { replacement: rep, composer: wizard.elements } });
  } else {
    await rpc('ADD_EXPANSION', { item: { trigger: ':new', replacement: rep, type: 'text', composer: wizard.elements } });
  }
  // close
  wizard = { open: false, editingId: null, elements: [], step: 1 };
  await reload();
  showToast('Saved');
}

async function update(id, patch){ await rpc('UPDATE_EXPANSION', { id, patch }); }
async function remove(id){ await rpc('DELETE_EXPANSION', { id }); await reload(); showToast('Deleted'); }
async function reload(){ const st = await rpc('GET_STATE'); setState({ data: st.data }); }

function list(){
  const items = applyFilter(getState().data.expansions || []);
  return el('div', { class:'grid cols-2 list' }, ...items.map(card));
}

function card(it){
  const cm = [
    { label:'Edit', onClick: ()=> editExisting(it) },
    { label:'Duplicate', onClick: async ()=>{ const copy = Object.assign({}, it, { id: undefined, trigger: (it.trigger||'')+'_copy' }); await rpc('ADD_EXPANSION', { item: copy }); await reload(); } },
    { label:'Delete', onClick: ()=> remove(it.id) }
  ];
  return el('div', { class:'card', oncontextmenu:(e)=>{ openContextMenu(e.pageX, e.pageY, cm); } },
    el('div', { class:'row between' },
      el('div', { class:'row' }, el('span', { class:'badge' }, it.type||'text'), el('span', { class:'small' }, `#${it.id}`)),
      el('div', {},
        el('button', { class:'btn secondary', onclick: ()=> editExisting(it) }, 'Edit'),
        el('button', { class:'btn secondary', onclick: ()=> remove(it.id) }, 'Delete')
      )
    ),
    el('div', { class:'row' },
      el('input', { class:'input', value: it.trigger || '', placeholder: 'Trigger', oninput:(e)=> update(it.id, { trigger: e.target.value }) })
    ),
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

/* Wizard UI */

function Stepper(){
  const steps = [
    { n:1, label:'Select first element' },
    { n:2, label:'Edit element' },
    { n:3, label:'Add next element or Save' }
  ];
  return el('div', { class:'stepper' },
    ...steps.map(s => el('div', { class:'step' + (wizard.step === s.n ? ' active' : '') }, `${s.n}. ${s.label}`))
  );
}

function elementPicker(){
  const btn = (label, on)=> el('button', { class:'btn', onclick:on }, label);
  return el('div', { class:'row' },
    btn('Text', ()=>{ wizard.elements.push({ type:'text', value:'' }); wizard.step = 2; setState({}); }),
    btn('User input', ()=>{ wizard.elements.push({ type:'input', label:'Label' }); wizard.step = 2; setState({}); }),
    btn('Variable', ()=>{ wizard.elements.push({ type:'variable', value:'' }); wizard.step = 2; setState({}); }),
    btn('Clipboard', ()=>{ wizard.elements.push({ type:'clipboard' }); wizard.step = 3; setState({}); }),
    btn('Date', ()=>{ wizard.elements.push({ type:'date', format:'%Y-%m-%d' }); wizard.step = 2; setState({}); }),
    btn('UUID', ()=>{ wizard.elements.push({ type:'uuid' }); wizard.step = 3; setState({}); })
  );
}

function elementEditor(){
  const idx = wizard.elements.length - 1;
  if (idx < 0) return el('div', {}, '');
  const item = wizard.elements[idx];

  if (item.type === 'text'){
    return el('div', {},
      el('label', {}, 'Text'),
      el('textarea', { class:'input', placeholder:'Enter text...', oninput:(e)=>{ item.value = e.target.value; } }, item.value||'')
    );
  }
  if (item.type === 'input'){
    return el('div', {},
      el('label', {}, 'Prompt label'),
      el('input', { class:'input', value: item.label || 'Input', oninput:(e)=>{ item.label = e.target.value; } })
    );
  }
  if (item.type === 'variable'){
    const vars = (getState().data.variables || []);
    return el('div', {},
      el('label', {}, 'Pick variable'),
      el('select', { class:'input', onchange:(e)=>{ item.value = e.target.value; } },
        el('option', { value:'' }, 'Select variable...'),
        ...vars.map(v => el('option', { value:v.name, selected: item.value === v.name }, `${v.name} (${v.type||'text'})`))
      )
    );
  }
  if (item.type === 'date'){
    return el('div', {},
      el('label', {}, 'Date format'),
      el('input', { class:'input', value: item.format || '%Y-%m-%d', oninput:(e)=>{ item.format = e.target.value; } })
    );
  }
  // clipboard and uuid need no edit
  return el('div', {}, el('div', { class:'small' }, 'No options for this element'));
}

function composerPreview(){
  return el('div', { class:'card' },
    el('div', { class:'small' }, 'Preview (template)'),
    el('textarea', { class:'input', readonly:true }, buildReplacement())
  );
}

function composerControls(){
  return el('div', { class:'row' },
    el('button', { class:'btn secondary', onclick: ()=>{ wizard.step = 1; setState({}); } }, 'Add another'),
    el('button', { class:'btn', onclick: saveWizard }, 'Save')
  );
}

function composer(){
  if (!wizard.open) return null;
  return el('div', { class:'card' },
    el('h3', {}, wizard.editingId ? 'Edit Expansion' : 'New Expansion'),
    Stepper(),
    wizard.step === 1 ? elementPicker() : null,
    wizard.step === 2 ? elementEditor() : null,
    new Array().length, // no-op to keep structure stable
    el('div', { class:'divider' }),
    composerPreview(),
    composerControls()
  );
}

export function render(){
  const wrap = el('div', {});
  wrap.appendChild(el('div', { class:'card' }, el('h3', {}, 'Expansions')));
  wrap.appendChild(toolbar());
  const c = composer();
  if (c) wrap.appendChild(c);
  wrap.appendChild(list());
  return wrap;
}
