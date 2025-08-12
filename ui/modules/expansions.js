// ui/modules/expansions.js
import { el, rpc, getState, setState, Toolbar, applyFilter, showToast, openContextMenu, openModal, closeModal, withSidebar, MarkdownEditor, triggerAutoSyncPush, WizardStepper } from '../utils.js';

export const id = 'expansions';
export const label = 'Expansions';

// Composer state
let wizard = {
  open: false,
  editingId: null,
  elements: [],
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
  openExpansionWizardModal('New Expansion');
  setState({});
}

async function editExisting(exp){
  const base = Array.isArray(exp.composer) && exp.composer.length
    ? exp.composer
    : [{ type: 'text', value: String(exp.replacement || '') }];
  wizard = { open: true, editingId: exp.id, elements: base.map(x => ({...x})), step: 1 };
  openExpansionWizardModal('Edit Expansion');
  setState({});
}

function buildReplacement(){
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
  wizard = { open: false, editingId: null, elements: [], step: 1 };
  const st = await rpc('GET_STATE');
  setState({ data: st.data });
  triggerAutoSyncPush();
  showToast('Saved');
}

async function update(id, patch){
  await rpc('UPDATE_EXPANSION', { id, patch });
  triggerAutoSyncPush();
}
async function remove(id){
  await rpc('DELETE_EXPANSION', { id });
  const st = await rpc('GET_STATE');
  setState({ data: st.data });
  triggerAutoSyncPush();
  showToast('Deleted');
}

function list(){
  const items = applyFilter(getState().data.expansions || []);
  return el('div', { class:'grid cols-2 list' }, ...items.map(card));
}

function card(it){
  const cm = [
    { label:'Edit (wizard)', onClick: ()=> editExisting(it) },
    { label:'Duplicate', onClick: async ()=>{ const copy = Object.assign({}, it, { id: undefined, trigger: (it.trigger||'')+'_copy' }); await rpc('ADD_EXPANSION', { item: copy }); const st = await rpc('GET_STATE'); setState({ data: st.data }); triggerAutoSyncPush(); } },
    { label:'Delete', onClick: ()=> remove(it.id) }
  ];
  return el('div', { class:'card', oncontextmenu:(e)=>{ e.preventDefault(); openContextMenu(e.pageX, e.pageY, cm); } },
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
    { n:3, label:'Add next or Save' }
  ];
  return WizardStepper(steps, wizard.step);
}

function openElementEditorModal(item){
  const body = el('div', {});
  if (item.type === 'text'){
    body.appendChild(el('label', {}, 'Text'));
    body.appendChild(MarkdownEditor({ value: item.value || '', oninput:(v)=>{ item.value = v; } }));
  } else if (item.type === 'input'){
    body.appendChild(el('label', {}, 'Prompt label'));
    body.appendChild(el('input', { class:'input', value: item.label || 'Input', 'data-focus-key':'exp-composer-label', oninput:(e)=>{ item.label = e.target.value; } }));
  } else if (item.type === 'variable'){
    const vars = (getState().data.variables || []);
    body.appendChild(el('label', {}, 'Pick variable'));
    body.appendChild(el('select', { class:'input', onchange:(e)=>{ item.value = e.target.value; } },
      el('option', { value:'' }, 'Select variable...'),
      ...vars.map(v => el('option', { value:v.name, selected: item.value === v.name }, `${v.name} (${v.type||'text'})`))
    ));
  } else if (item.type === 'date'){
    body.appendChild(el('label', {}, 'Date format'));
    body.appendChild(el('input', { class:'input', value: item.format || '%Y-%m-%d', 'data-focus-key':'exp-composer-date', oninput:(e)=>{ item.format = e.target.value; } }));
    body.appendChild(el('div', { class:'small' },
      'Format tokens: %Y year 4-digit, %m month 2-digit, %d day, %H hour, %M minute, %S second. Example: %Y-%m-%d.'
    ));
  } else {
    body.appendChild(el('div', { class:'small' }, 'No options for this element'));
  }

  openModal({
    title: 'Edit Element',
    body,
    actions: [
      el('button', { class:'btn secondary', onclick: closeModal }, 'Cancel'),
      el('button', { class:'btn', onclick: ()=>{ wizard.step = 3; setState({}); closeModal(); } }, 'Apply')
    ]
  });
}

function elementPicker(){
  const btn = (label, on)=> el('button', { class:'btn', onclick:on }, label);
  return el('div', { class:'row' },
    btn('Text', ()=>{ const it = { type:'text', value:'' }; wizard.elements.push(it); wizard.step = 2; setState({}); openElementEditorModal(it); }),
    btn('User input', ()=>{ const it = { type:'input', label:'Label' }; wizard.elements.push(it); wizard.step = 2; setState({}); openElementEditorModal(it); }),
    btn('Variable', ()=>{ const it = { type:'variable', value:'' }; wizard.elements.push(it); wizard.step = 2; setState({}); openElementEditorModal(it); }),
    btn('Clipboard', ()=>{ wizard.elements.push({ type:'clipboard' }); wizard.step = 3; setState({}); }),
    btn('Date', ()=>{ const it = { type:'date', format:'%Y-%m-%d' }; wizard.elements.push(it); wizard.step = 2; setState({}); openElementEditorModal(it); }),
    btn('UUID', ()=>{ wizard.elements.push({ type:'uuid' }); wizard.step = 3; setState({}); })
  );
}

function composerPreview(){
  return el('div', { class:'card' },
    el('div', { class:'small' }, 'Preview (template)'),
    el('textarea', { class:'input big', readonly:true }, buildReplacement())
  );
}

function composerControls(){
  return el('div', { class:'row' },
    el('button', { class:'btn secondary', onclick: ()=>{ wizard.step = 1; setState({}); } }, 'Add another'),
    el('button', { class:'btn', onclick: saveWizard }, 'Save')
  );
}

function librarySidebar(){
  const list = applyFilter(getState().data.expansions || []);
  const side = el('div', { class:'card' }, el('h3', {}, 'Library'));
  if (!list.length){
    side.appendChild(el('div', { class:'small' }, 'No expansions yet.'));
    return side;
  }
  list.forEach(ex => {
    side.appendChild(el('div', { class:'row' },
      el('button', { class:'btn secondary', onclick: ()=> editExisting(ex) }, `${ex.trigger || '(no trigger)'}  #${ex.id}`)
    ));
  });
  return side;
}

function composer(){
  return el('div', { class:'card' },
    el('h3', {}, wizard.editingId ? 'Edit Expansion' : 'New Expansion'),
    Stepper(),
    wizard.step === 1 ? elementPicker() : null,
    wizard.step === 2 ? el('div', { class:'small' }, 'Editor opened in modal. Close it to continue.') : null,
    el('div', { class:'divider' }),
    composerPreview(),
    composerControls()
  );
}

function openExpansionWizardModal(title){
  const body = el('div', {}, composer());
  openModal({
    title: title || 'Expansion',
    body,
    actions: [
      el('button', { class:'btn secondary', onclick: closeModal }, 'Close'),
      el('button', { class:'btn', onclick: ()=>{ saveWizard().then(()=> closeModal()); } }, 'Save')
    ]
  });
}

export function render(){
  const main = el('div', {});
  main.appendChild(el('div', { class:'card' }, el('h3', {}, 'Expansions')));
  main.appendChild(toolbar());
  main.appendChild(list());
  const content = el('div', {});
  content.appendChild(main);
  return withSidebar(librarySidebar(), content);
}
