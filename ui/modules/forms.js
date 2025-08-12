// ui/modules/forms.js
import { el, rpc, getState, setState, Toolbar, showToast, uid, openContextMenu, openModal, closeModal, withSidebar, MarkdownEditor, triggerAutoSyncPush, WizardStepper } from '../utils.js';

export const id = 'forms';
export const label = 'Forms';

const PALETTE = [
  { type: 'text', label: 'Text' },
  { type: 'textarea', label: 'Paragraph' },
  { type: 'number', label: 'Number' },
  { type: 'date', label: 'Date' },
  { type: 'select', label: 'Select' },
  { type: 'variable', label: 'Variable' },
  { type: 'form', label: 'Form' }
];

// Wizard state for sequential field building
let fwiz = { open:false, step:1, current:null, formId:null };

// Showcase sample fields remain
const SAMPLE_FIELDS = [
  { type:'text', label:'Full Name', key:'full_name', required:true, default:'' },
  { type:'textarea', label:'Description', key:'description', required:false, default:'' },
  { type:'select', label:'Priority', key:'priority', required:true, options:['Low','Medium','High'], default:'Medium' }
];

function toolbar(){ return Toolbar({ buttons: [ el('button', { class:'btn', onclick: addForm }, 'Add Form') ] }); }
async function addForm(){ const { id } = await rpc('ADD_FORM', { item: { name: 'New Form', description: '', fields: [] } }); await reload(); setState({ tab: 'forms', selectedFormId: id }); triggerAutoSyncPush(); showToast('Added'); }
async function updateForm(id, patch){ await rpc('UPDATE_FORM', { id, patch }); triggerAutoSyncPush(); }
async function deleteForm(id){ await rpc('DELETE_FORM', { id }); await reload(); triggerAutoSyncPush(); showToast('Deleted'); }
async function reload(){ const st = await rpc('GET_STATE'); setState({ data: st.data }); }

function header(form){
  const s = getState();
  const formsArr = ((s.data && s.data.forms) || []);
  return el('div', { class:'row between card' },
    el('div', { class:'row' },
      el('label', {}, 'Form Name'),
      el('input', { class:'input', value: form? form.name: '', oninput:(e)=> form && updateForm(form.id, { name: e.target.value }) })
    ),
    el('div', { class:'row' },
      el('label', {}, 'Select'),
      el('select', { onchange:(e)=> setState({ selectedFormId: Number(e.target.value)||null }) },
        ...formsArr.map(f => el('option', { value: f.id, selected: form && f.id===form.id }, `#${f.id} ${f.name}`))
      ),
      el('button', { class:'btn secondary', onclick: ()=> addForm() }, 'New Form'),
      el('button', { class:'btn secondary', onclick: ()=> form && deleteForm(form.id) }, 'Delete')
    )
  );
}

/* Field editor wizard in modal */
function openFieldEditorModal(form, field){
  let step = 1;
  const StepHdr = ()=> WizardStepper([
    { n:1, label:'Basics' },
    { n:2, label:'Options' },
    { n:3, label:'Review' }
  ], step);

  const basics = el('div', {},
    el('label', {}, 'Label'),
    el('input', { class:'input', value: field.label||'', oninput:(e)=>{ field.label = e.target.value; } }),
    el('label', {}, 'Key'),
    el('input', { class:'input', value: field.key||'', oninput:(e)=>{ field.key = e.target.value; } }),
    el('label', {}, 'Default'),
    MarkdownEditor({ value: field.default||'', oninput:(v)=>{ field.default = v; } }),
    el('div', { class:'row' }, el('label', {}, el('input', { type:'checkbox', checked: !!field.required, onchange:(e)=>{ field.required = !!e.target.checked; } }), ' Required')),
    el('div', { class:'row' }, el('button', { class:'btn', onclick: ()=>{ step = 2; renderBody(); } }, 'Next'))
  );

  const options = el('div', {});
  if (field.type === 'select'){
    options.appendChild(el('div', { class:'small' }, 'Options (comma separated)'));
    options.appendChild(el('input', { class:'input', value:(field.options||[]).join(', '), oninput:(e)=>{ field.options = e.target.value.split(',').map(s=>s.trim()).filter(Boolean); } }));
  } else if (field.type === 'variable'){
    const s = getState();
    const vars = ((s.data && s.data.variables) || []);
    options.appendChild(el('div', { class:'small' }, 'Variable source'));
    options.appendChild(el('select', { onchange:(e)=>{ field.variable = e.target.value || ''; } },
      el('option', { value:'' }, 'Select variable...'),
      ...vars.map(v => el('option', { value:v.name, selected: field.variable === v.name }, `${v.name} (${v.type||'text'})`))
    ));
  } else if (field.type === 'form'){
    const s = getState();
    const formsArr = ((s.data && s.data.forms) || []);
    options.appendChild(el('div', { class:'small' }, 'Linked form'));
    options.appendChild(el('select', { onchange:(e)=>{ field.formId = Number(e.target.value)||null; } },
      el('option', { value:'' }, 'Select form...'),
      ...formsArr.map(f => el('option', { value:String(f.id), selected: field.formId === f.id }, `#${f.id} ${f.name}`))
    ));
  } else if (field.type === 'date'){
    options.appendChild(el('div', { class:'small' }, 'Date fields store values as YYYY-MM-DD. Example: 2025-08-12.'));
  } else {
    options.appendChild(el('div', { class:'small' }, 'No additional options'));
  }
  options.appendChild(el('div', { class:'row' },
    el('button', { class:'btn secondary', onclick: ()=>{ step = 1; renderBody(); } }, 'Back'),
    el('button', { class:'btn', onclick: ()=>{ step = 3; renderBody(); } }, 'Next')
  ));

  const review = el('div', {},
    el('div', { class:'small' }, `Type: ${field.type}`),
    el('div', { class:'small' }, `Key: ${field.key}`),
    el('div', { class:'small' }, `Label: ${field.label}`),
    el('div', { class:'small' }, `Required: ${field.required ? 'yes' : 'no'}`),
    el('div', { class:'row' },
      el('button', { class:'btn secondary', onclick: ()=>{ step = 2; renderBody(); } }, 'Back'),
      el('button', { class:'btn', onclick: ()=>{ updateForm(form.id, { fields: form.fields }); closeModal(); showToast('Field updated'); } }, 'Apply')
    )
  );

  const container = el('div', {});
  function renderBody(){
    container.innerHTML = '';
    container.appendChild(StepHdr());
    container.appendChild(step===1 ? basics : step===2 ? options : review);
  }
  renderBody();

  openModal({
    title: 'Field Editor',
    body: container,
    actions: [
      el('button', { class:'btn secondary', onclick: ()=> closeModal() }, 'Close')
    ]
  });
}

/* Builder wizard view */
function fwStep(){
  const s = getState();
  const formsArr = ((s.data && s.data.forms) || []);
  const form = formsArr.find(f=>f.id===s.selectedFormId) || formsArr[0];
  if (!form) return el('div', { class:'small' }, 'Create a form to start.');
  if (!fwiz.open) return null;

  function addFieldOfType(t){
    const f = { id: uid(), type: t.type, label: t.label+' Field', key: 'field_'+Math.random().toString(36).slice(2,7), required: false, options: [], default: '' };
    if (t.type === 'variable') f.variable = '';
    if (t.type === 'form') f.formId = null;
    form.fields.push(f);
    updateForm(form.id, { fields: form.fields });
    openFieldEditorModal(form, f);
  }
  function moveField(formObj, idx, dir){
    const to = idx + dir;
    if (to < 0 || to >= formObj.fields.length) return;
    const [x] = formObj.fields.splice(idx,1);
    formObj.fields.splice(to,0,x);
    updateForm(formObj.id, { fields: formObj.fields });
    setState({});
  }

  const picker = el('div', { class:'row' },
    ...PALETTE.map(p => el('button', { class:'btn', onclick: ()=> addFieldOfType(p) }, p.label))
  );

  const list = el('div', { class:'card' },
    el('h3', {}, 'Fields'),
    ...(form.fields.length ? form.fields.map((f, i) => el('div', { class:'row' },
      el('span', { class:'badge' }, f.type),
      el('span', { class:'small' }, f.key),
      el('button', { class:'btn secondary', onclick: ()=> moveField(form, i, -1) }, 'Up'),
      el('button', { class:'btn secondary', onclick: ()=> moveField(form, i, 1) }, 'Down'),
      el('button', { class:'btn secondary', onclick: ()=> openFieldEditorModal(form, f) }, 'Edit'),
      el('button', { class:'btn secondary', onclick: ()=>{ form.fields = form.fields.filter(x=>x.id!==f.id); updateForm(form.id, { fields: form.fields }); } }, 'Delete')
    )) : [el('div', { class:'small' }, 'No fields yet. Add one above.')])
  );

  return el('div', { class:'card' },
    el('h3', {}, 'Form Wizard'),
    WizardStepper([
      { n:1, label:'Select field' },
      { n:2, label:'Edit field' },
      { n:3, label:'Add next or Save' }
    ], 1),
    picker,
    el('div', { class:'divider' }),
    list
  );
}

function librarySidebar(){
  const s = getState();
  const formsArr = ((s.data && s.data.forms) || []);
  const wrap = el('div', { class:'card' }, el('h3', {}, 'Library'));
  if (!formsArr.length){
    wrap.appendChild(el('div', { class:'small' }, 'No forms yet.'));
    return wrap;
  }
  formsArr.forEach(f => {
    wrap.appendChild(el('div', { class:'row' },
      el('button', { class:'btn secondary', onclick: ()=>{ setState({ selectedFormId: f.id }); fwiz = { open:true, step:1, current:null, formId: f.id }; } }, `#${f.id} ${f.name}`)
    ));
  });
  wrap.appendChild(el('div', { class:'divider' }));
  wrap.appendChild(el('div', { class:'small' }, 'Quick add examples'));
  SAMPLE_FIELDS.forEach(sf => {
    wrap.appendChild(el('div', { class:'row' },
      el('button', { class:'btn secondary', onclick: ()=>{ const s2 = getState(); const arr = ((s2.data && s2.data.forms) || []); const current = arr.find(ff=>ff.id===s2.selectedFormId) || arr[0]; if (!current) return; const copy = Object.assign({ id: uid() }, sf); current.fields.push(copy); updateForm(current.id, { fields: current.fields }); showToast('Field added'); } }, sf.label)
    ));
  });
  return wrap;
}

export function render(){
  const s = getState();
  const formsArr = ((s.data && s.data.forms) || []);
  const form = formsArr.find(f=>f.id===s.selectedFormId) || formsArr[0];

  const main = el('div', {});
  main.appendChild(el('div', { class:'card' }, el('h3', {}, 'Forms')));
  main.appendChild(toolbar());
  main.appendChild(form ? header(form) : el('div', { class:'small' }, 'No forms yet. Create one to get started.'));
  main.appendChild(fwiz.open ? fwStep() : el('div', { class:'card' }, el('div', { class:'row' }, el('button', { class:'btn', onclick: ()=>{ fwiz = { open:true, step:1, current:null, formId: form ? form.id : null }; setState({}); } }, 'Open Form Wizard'))));
  return withSidebar(librarySidebar(), main);
}
