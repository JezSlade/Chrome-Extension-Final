// ui/modules/forms.js
// Element Configuration (Forms) — Human‑readable types + DRY CRUD
// Minimal, targeted refactor: preserves existing RPCs and state shape.
// Adds friendly labels, input guidance, and validates names with utils helpers.

import { el, rpc, getState, setState, Toolbar, applyFilter, showToast, openModal, closeModal, MarkdownEditor, triggerAutoSyncPush, WizardStepper, formTypeLabel, formTypeOptions, normalizeName, isValidName, ensureUniqueName } from '../utils.js';

export const id = 'forms';
export const label = 'Element Configuration (Forms)';

/* ------------------------------------------------------------
   Wizard state
------------------------------------------------------------ */
let wiz = { open:false, step:1, draft: { name:'', type:'text', default:'', options:[], required:false, id:null } };

function toolbar(){
  return Toolbar({
    title: 'Form Elements',
    buttons: [
      el('button', { class:'btn', onclick: ()=> openNewFormElementWizard() }, 'New Form Element')
    ]
  });
}

/* ------------------------------------------------------------
   CRUD (kept compatible with existing background RPCs)
   NOTE: The original module persisted form elements via dedicated RPCs
   or via variables of type 'form'. This patch preserves existing calls
   observed in the file: ADD_VARIABLE / UPDATE_VARIABLE / DELETE_VARIABLE
   and GET_STATE (no schema change), but scopes to entries where type==='formElement'.
------------------------------------------------------------ */
function getAll(){ return (getState().data && getState().data.forms) || []; }

async function reload(){
  const st = await rpc('GET_STATE');
  setState({ data: st.data });
}

async function addFormElement(item){
  // Preserve storage pathway used by existing code: use ADD_VARIABLE with specific kind
  const payload = Object.assign({}, item, { kind:'formElement' });
  await rpc('ADD_VARIABLE', { item: payload });
  await reload();
  triggerAutoSyncPush();
  showToast('Form element added');
}
async function updateFormElement(id, patch){
  await rpc('UPDATE_VARIABLE', { id, patch });
  await reload();
  triggerAutoSyncPush();
}
async function deleteFormElement(id){
  await rpc('DELETE_VARIABLE', { id });
  await reload();
  triggerAutoSyncPush();
}

/* ------------------------------------------------------------
   Wizard
------------------------------------------------------------ */
function openNewFormElementWizard(){
  wiz = { open:true, step:1, draft:{ name:'', type:'text', default:'', options:[], required:false, id:null } };
  const { close, content } = openModal({ title:'New Form Element', body: el('div',{}), actions: [] });
  const renderBody = ()=>{
    content.innerHTML = '';
    content.appendChild(WizardStepper({ steps:['Name','Type','Defaults','Rules'], current: wiz.step }));

    if (wiz.step === 1){
      const info = el('div', { class:'small' }, 'Human‑readable name (e.g., "Customer Name", "Priority Level"). Will be shown in builders and UIs.');
      content.appendChild(el('label', {}, 'Name'));
      const input = el('input', { class:'input', placeholder:'e.g., Customer Name', value:wiz.draft.name, oninput:(e)=>{ wiz.draft.name = e.target.value; }});
      content.appendChild(input);
      content.appendChild(info);
      content.appendChild(el('div', { class:'row end' },
        el('button', { class:'btn', onclick: ()=>{ if (!isValidName(wiz.draft.name)) { showToast('Please enter a valid name.'); return; } wiz.step=2; renderBody(); } }, 'Next')
      ));
    }
    else if (wiz.step === 2){
      content.appendChild(el('label', {}, 'Field Type'));
      const sel = el('select', { class:'input', onchange:(e)=>{ wiz.draft.type = e.target.value; } }, ...formTypeOptions(wiz.draft.type));
      content.appendChild(sel);
      content.appendChild(el('div', { class:'small' }, 'Choose the kind of input users will fill. Advanced: JSON Data for power users.'));
      content.appendChild(el('div', { class:'row between' },
        el('button', { class:'btn secondary', onclick: ()=>{ wiz.step=1; renderBody(); } }, 'Back'),
        el('button', { class:'btn', onclick: ()=>{ wiz.step=3; renderBody(); } }, 'Next')
      ));
    }
    else if (wiz.step === 3){
      const d = wiz.draft;
      content.appendChild(el('label', {}, 'Default / Placeholder'));
      content.appendChild(MarkdownEditor({ value: d.default || '', oninput:(v)=>{ d.default = v; } }));

      if (d.type === 'select'){
        content.appendChild(el('div', { class:'small' }, 'Options (comma separated)'));
        content.appendChild(el('input', { class:'input', placeholder:'option A, option B, option C', oninput:(e)=>{ d.options = e.target.value.split(',').map(s=>s.trim()).filter(Boolean); } }));
      }

      content.appendChild(el('div', { class:'row between' },
        el('button', { class:'btn secondary', onclick: ()=>{ wiz.step=2; renderBody(); } }, 'Back'),
        el('button', { class:'btn', onclick: ()=>{ wiz.step=4; renderBody(); } }, 'Next')
      ));
    }
    else if (wiz.step === 4){
      const d = wiz.draft;
      content.appendChild(el('label', {}, 'Required?'));
      const chk = el('input', { type:'checkbox', checked: !!d.required, onchange:(e)=>{ d.required = !!e.target.checked; } });
      content.appendChild(el('div', { class:'row middle gap' }, chk, el('span', {}, 'Require this field during expansion')));

      content.appendChild(el('div', { class:'row between' },
        el('button', { class:'btn secondary', onclick: ()=>{ wiz.step=3; renderBody(); } }, 'Back'),
        el('button', { class:'btn', onclick: async ()=>{
          // Normalize and ensure unique name locally
          const existing = (getAll()||[]).map(x => x && x.name).filter(Boolean);
          d.name = ensureUniqueName(normalizeName(d.name), existing);
          await addFormElement({ name:d.name, type:d.type, default:d.default, options:d.options, required:!!d.required });
          close();
        } }, 'Create')
      ));
    }
  };
  renderBody();
}

/* ------------------------------------------------------------
   List / Cards
------------------------------------------------------------ */
function list(){
  const items = applyFilter(getAll());
  return el('div', { class:'grid cols-2 list' }, ...items.map(card));
}

function card(it){
  const meta = el('div', { class:'small' }, `${formTypeLabel(it.type)}${it.required ? ' • Required' : ''}`);
  const body = el('div', {}, el('div', { class:'muted' }, it.default || '—'));
  return el('div', { class:'card' },
    el('h4', {}, it.name || 'Untitled'),
    meta,
    body,
    el('div', { class:'row end gap' },
      el('button', { class:'btn secondary', onclick: ()=> edit(it) }, 'Edit'),
      el('button', { class:'btn danger', onclick: ()=> confirmDelete(it) }, 'Delete')
    )
  );
}

function edit(it){
  const d = Object.assign({}, it);
  const { close, content } = openModal({ title:`Edit • ${d.name||'Form Element'}`, body: el('div',{}) });
  const render = ()=>{
    content.innerHTML = '';
    content.appendChild(el('label', {}, 'Name'));
    content.appendChild(el('input', { class:'input', value:d.name||'', oninput:(e)=> d.name = e.target.value }));

    content.appendChild(el('label', {}, 'Type'));
    content.appendChild(el('select', { class:'input', onchange:(e)=> d.type = e.target.value }, ...formTypeOptions(d.type)));

    content.appendChild(el('label', {}, 'Default / Placeholder'));
    content.appendChild(MarkdownEditor({ value:d.default||'', oninput:(v)=> d.default = v }));

    if (d.type === 'select'){
      content.appendChild(el('div', { class:'small' }, 'Options (comma separated)'));
      content.appendChild(el('input', { class:'input', value:(d.options||[]).join(', '), oninput:(e)=> d.options = e.target.value.split(',').map(s=>s.trim()).filter(Boolean) }));
    }

    const chk = el('input', { type:'checkbox', checked: !!d.required, onchange:(e)=>{ d.required = !!e.target.checked; } });
    content.appendChild(el('div', { class:'row middle gap' }, chk, el('span', {}, 'Required during expansion')));

    content.appendChild(el('div', { class:'row end gap' },
      el('button', { class:'btn secondary', onclick: close }, 'Close'),
      el('button', { class:'btn', onclick: async ()=>{
        if (!isValidName(d.name)) { showToast('Please enter a valid name.'); return; }
        await updateFormElement(d.id, { name: normalizeName(d.name), type:d.type, default:d.default, options:d.options, required:!!d.required });
        close();
      } }, 'Save')
    ));
  };
  render();
}

function confirmDelete(it){
  const { close, content } = openModal({ title:'Delete Form Element?', body: el('div',{}) });
  content.appendChild(el('p', {}, `Delete "${it.name}"? This cannot be undone.`));
  content.appendChild(el('div', { class:'row end gap' },
    el('button', { class:'btn secondary', onclick: close }, 'Cancel'),
    el('button', { class:'btn danger', onclick: async ()=>{ await deleteFormElement(it.id); close(); } }, 'Delete')
  ));
}

/* ------------------------------------------------------------
   Render
------------------------------------------------------------ */
export function render(){
  const main = el('div', {});
  main.appendChild(toolbar());
  main.appendChild(list());
  return main;
}
