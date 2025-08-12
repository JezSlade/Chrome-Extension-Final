// ui/modules/forms.js
import { el, rpc, getState, setState, Toolbar, showToast, uid, openContextMenu } from '../utils.js';
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
function toolbar(){ return Toolbar({ buttons: [ el('button', { class:'btn', onclick: addForm }, 'Add Form') ] }); }
async function addForm(){ const { id } = await rpc('ADD_FORM', { item: { name: 'New Form', description: '', fields: [] } }); await reload(); setState({ tab: 'forms', selectedFormId: id }); showToast('Added'); }
async function updateForm(id, patch){ await rpc('UPDATE_FORM', { id, patch }); }
async function deleteForm(id){ await rpc('DELETE_FORM', { id }); await reload(); showToast('Deleted'); }
async function reload(){ const st = await rpc('GET_STATE'); setState({ data: st.data }); }
function header(form){
  return el('div', { class:'row between card' },
    el('div', { class:'row' }, el('label', {}, 'Form Name'), el('input', { class:'input', value: form? form.name: '', oninput:(e)=> form && updateForm(form.id, { name: e.target.value }) })),
    el('div', { class:'row' },
      el('label', {}, 'Select'),
      el('select', { onchange:(e)=> setState({ selectedFormId: Number(e.target.value)||null }) },
        ...(getState().data.forms || []).map(f => el('option', { value: f.id, selected: form && f.id===form.id }, `#${f.id} ${f.name}`))
      ),
      el('button', { class:'btn secondary', onclick: ()=> addForm() }, 'New Form'),
      el('button', { class:'btn secondary', onclick: ()=> form && deleteForm(form.id) }, 'Delete')
    )
  );
}
function builder(form){
  function onDragStart(e, payload){ e.dataTransfer.setData('application/x-toolforge', JSON.stringify(payload)); e.dataTransfer.effectAllowed = 'copy'; }
  function onDropField(e){ e.preventDefault(); const d = e.dataTransfer.getData('application/x-toolforge'); if (!d) return; const p = JSON.parse(d); const f = { id: uid(), type: p.type, label: p.label + ' Field', key: 'field_'+Math.random().toString(36).slice(2,7), required: false, options: [], default: '' }; if (p.type === 'variable') f.variable = ''; if (p.type === 'form') f.formId = null; form.fields.push(f); updateForm(form.id, { fields: form.fields }); }
  function onDragOver(e){ e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  function moveField(fromId, toId){ if (fromId === toId) return; const iFrom = form.fields.findIndex(f=>f.id===fromId); const iTo = form.fields.findIndex(f=>f.id===toId); if (iFrom<0 || iTo<0) return; const [f] = form.fields.splice(iFrom, 1); form.fields.splice(iTo, 0, f); updateForm(form.id, { fields: form.fields }); }
  const palette = el('div', { class:'card palette' },
    el('div', { class:'small' }, 'Palette'),
    ...PALETTE.map(p => el('div', { class:'item', draggable:true, ondragstart:(e)=> onDragStart(e,p) }, p.label))
  );
  const canvas = el('div', { class:'card canvas', ondragover:onDragOver, ondrop:onDropField },
    ...(form.fields.length ? form.fields.map(f => fieldCard(form, f, moveField)) : [el('div', { class:'small' }, 'Drag items here')])
  );
  return el('div', { class:'builder grid' }, palette, canvas);
}
function fieldCard(form, field, moveField){
  function onDragStartHandle(e){ e.dataTransfer.setData('text/x-from-id', String(field.id)); e.dataTransfer.effectAllowed = 'move'; }
  function onDropSwap(e){ e.preventDefault(); const from = Number(e.dataTransfer.getData('text/x-from-id')); if (from) moveField(from, field.id); }
  function onDragOverSwap(e){ e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
  function onDragLeaveSwap(e){ e.currentTarget.classList.remove('drag-over'); }
  const cm = [
    { label:'Duplicate', onClick: ()=>{ const copy = Object.assign({}, field, { id: uid(), key: field.key + '_copy' }); form.fields.push(copy); updateForm(form.id, { fields: form.fields }); } },
    { label:'Delete', onClick: ()=>{ form.fields = form.fields.filter(f=>f.id!==field.id); updateForm(form.id, { fields: form.fields }); } }
  ];
  return el('div', { class:'field', draggable:true, ondragstart:onDragStartHandle, ondragover:onDragOverSwap, ondragleave:onDragLeaveSwap, ondrop:onDropSwap, oncontextmenu:(e)=> openContextMenu(e.pageX, e.pageY, cm) },
    el('div', {},
      el('div', { class:'row between' },
        el('div', { class:'row' }, el('span', { class:'badge' }, field.type), el('span', { class:'small' }, field.key)),
        el('div', { class:'handle' }, 'Drag')
      ),
      el('div', { class:'meta' },
        el('input', { class:'input', placeholder:'Label', value: field.label||'', oninput:(e)=>{ field.label = e.target.value; updateForm(form.id, { fields: form.fields }); } }),
        el('input', { class:'input', placeholder:'Key', value: field.key||'', oninput:(e)=>{ field.key = e.target.value; updateForm(form.id, { fields: form.fields }); } }),
        el('select', { onchange:(e)=>{ field.type = e.target.value; updateForm(form.id, { fields: form.fields }); } },
          el('option', { value:'text', selected: field.type==='text' }, 'text'),
          el('option', { value:'textarea', selected: field.type==='textarea' }, 'textarea'),
          el('option', { value:'number', selected: field.type==='number' }, 'number'),
          el('option', { value:'date', selected: field.type==='date' }, 'date'),
          el('option', { value:'select', selected: field.type==='select' }, 'select'),
          el('option', { value:'variable', selected: field.type==='variable' }, 'variable'),
          el('option', { value:'form', selected: field.type==='form' }, 'form')
        ),
        el('label', {}, el('input', { type:'checkbox', checked: !!field.required, onchange:(e)=>{ field.required = !!e.target.checked; updateForm(form.id, { fields: form.fields }); } }), ' Required')
      ),
      inputPreview(form, field)
    ),
    el('div', {}, el('button', { class:'btn secondary', onclick: ()=>{ const copy = Object.assign({}, field, { id: uid(), key: field.key + '_copy' }); form.fields.push(copy); updateForm(form.id, { fields: form.fields }); } }, 'Duplicate'), el('button', { class:'btn secondary', onclick: ()=>{ form.fields = form.fields.filter(f=>f.id!==field.id); updateForm(form.id, { fields: form.fields }); } }, 'Delete'))
  );
}
function inputPreview(form, field){
  if (field.type==='textarea') return el('textarea', { placeholder:'Preview...' }, field.default||'');
  if (field.type==='number') return el('input', { class:'input', type:'number', placeholder:'Preview...', value: field.default||'' });
  if (field.type==='date') return el('input', { class:'input', type:'date', placeholder:'Preview...', value: field.default||'' });
  if (field.type==='select') return selectEditor(form, field);
  if (field.type==='variable') return variableFieldEditor(form, field);
  if (field.type==='form') return formLinkEditor(form, field);
  return el('input', { class:'input', placeholder:'Preview...', value: field.default||'' });
}
function selectEditor(form, field){
  const wrap = el('div', {});
  wrap.appendChild(el('div', { class:'small' }, 'Options (comma separated)'));
  wrap.appendChild(el('input', { class:'input', value:(field.options||[]).join(', '), oninput:(e)=>{ field.options = e.target.value.split(',').map(s=>s.trim()).filter(Boolean); updateForm(form.id, { fields: form.fields }); } }));
  return wrap;
}
function variableFieldEditor(form, field){
  const sel = el('select', { onchange:(e)=>{ field.variable = e.target.value || ''; updateForm(form.id, { fields: form.fields }); } },
    el('option', { value:'' }, 'Select variable...'),
    ...(getState().data.variables || []).map(v => el('option', { value:v.name, selected: field.variable === v.name }, `${v.name} (${v.type||'text'})`))
  );
  return el('div', {}, el('div', { class:'small' }, 'Variable'), sel);
}
function formLinkEditor(form, field){
  const sel = el('select', { onchange:(e)=>{ field.formId = Number(e.target.value)||null; updateForm(form.id, { fields: form.fields }); } },
    el('option', { value:'' }, 'Select form...'),
    ...(getState().data.forms || []).map(f => el('option', { value:String(f.id), selected: field.formId === f.id }, `#${f.id} ${f.name}`))
  );
  return el('div', {}, el('div', { class:'small' }, 'Linked form'), sel);
}
export function render(){
  const s = getState();
  const form = (s.data.forms || []).find(f=>f.id===s.selectedFormId) || (s.data.forms || [])[0];
  const wrap = el('div', {});
  wrap.appendChild(el('div', { class:'card' }, el('h3', {}, 'Forms')));
  wrap.appendChild(toolbar());
  wrap.appendChild(form ? header(form) : el('div', { class:'small' }, 'No forms yet. Create one to get started.'));
  if (form) wrap.appendChild(builder(form));
  return wrap;
}
