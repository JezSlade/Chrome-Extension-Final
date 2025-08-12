// ui/modules/variables.js
import { el, rpc, getState, setState, Toolbar, applyFilter, showToast, openContextMenu, openModal, closeModal, withSidebar, MarkdownEditor, triggerAutoSyncPush, WizardStepper } from '../utils.js';

export const id = 'variables';
export const label = 'Variables';

// Wizard state
let wizard = { open:false, step:1, draft:{ name:'', type:'text', default:'', options:[], linkedFormId:null, linkedPromptId:null, id:null }, _openedEditor:false };

function header(){
  return el('div', { class:'card' },
    el('h3', {}, 'Variables'),
    el('div', { class:'small' }, 'Tokens: {{name}}, {{date:+%Y-%m-%d}}, {{clipboard}}, {{env.KEY}}, {{output:cmd}}, {{input:Label}}, {{uuid}}, {{cursor}}, {{if var}}...{{endif}}, {{match_1}}.')
  );
}

function toolbar(){
  return Toolbar({ buttons: [ el('button', { class:'btn', onclick: startWizard }, 'New Variable') ] });
}
function startWizard(prefill){
  wizard = { open:true, step:1, draft:Object.assign({ name:'', type:'text', default:'', options:[], linkedFormId:null, linkedPromptId:null, id:null }, prefill||{}), _openedEditor:false };
  openVariableWizardModal();
  setState({});
}

async function saveWizard(){
  const d = wizard.draft;
  if (!d.name.trim()){ showToast('Name required'); return; }
  if (d.id){
    await rpc('UPDATE_VARIABLE', { id: d.id, patch: d });
  } else {
    const res = await rpc('ADD_VARIABLE', { item: d });
    if (res && res.id) d.id = res.id;
  }
  wizard = { open:false, step:1, draft:{ name:'', type:'text', default:'', options:[], linkedFormId:null, linkedPromptId:null, id:null }, _openedEditor:false };
  const st = await rpc('GET_STATE');
  setState({ data: st.data });
  triggerAutoSyncPush();
  showToast('Saved');
}

async function updateVariable(id, patch){
  await rpc('UPDATE_VARIABLE', { id, patch });
  triggerAutoSyncPush();
}
async function deleteVariable(id){
  await rpc('DELETE_VARIABLE', { id });
  const st = await rpc('GET_STATE');
  setState({ data: st.data });
  triggerAutoSyncPush();
  showToast('Deleted');
}

function list(){
  const items = applyFilter(getState().data.variables || []);
  return el('div', { class:'grid cols-2 list' }, ...items.map(card));
}

function card(it){
  const cm = [
    { label:'Edit (wizard)', onClick: ()=> startWizard(it) },
    { label:'Delete', onClick: ()=> deleteVariable(it.id) }
  ];
  const typeInput = el('input', { class:'input', list:'varTypes', value: it.type || 'text', oninput:(e)=> updateVariable(it.id, { type: e.target.value }) });
  const typeList = datalist();

  const ext = [];
  if (it.type === 'select'){
    ext.push(el('div', { class:'small' }, 'Options (comma separated)'));
    ext.push(el('input', { class:'input', value: (it.options||[]).join(', '), oninput:(e)=> updateVariable(it.id, { options: e.target.value.split(',').map(s=>s.trim()).filter(Boolean) }) }));
  }
  if (it.type === 'form'){
    const forms = getState().data.forms || [];
    const sel = el('select', { onchange:(e)=> updateVariable(it.id, { linkedFormId: Number(e.target.value)||null }) },
      el('option', { value:'' }, 'Select form...'),
      ...forms.map(f => el('option', { value:String(f.id), selected: it.linkedFormId === f.id }, `#${f.id} ${f.name}`))
    );
    ext.push(el('div', { class:'small' }, 'Linked form'));
    ext.push(sel);
  }
  if (it.type === 'prompt'){
    const prompts = getState().prompts || [];
    const sel = el('select', { onchange:(e)=> updateVariable(it.id, { linkedPromptId: Number(e.target.value)||null }) },
      el('option', { value:'' }, 'Select saved prompt...'),
      ...prompts.map(p => el('option', { value:String(p.id), selected: it.linkedPromptId === p.id }, `#${p.id} ${p.name}`))
    );
    ext.push(el('div', { class:'small' }, 'Linked prompt'));
    ext.push(sel);
  }
  if (it.type === 'formatDate'){
    ext.push(el('div', { class:'small' }, 'Format tokens: %Y year, %m month, %d day. Example: %Y-%m-%d.'));
    ext.push(el('input', { class:'input', value: it.default || '%Y-%m-%d', oninput:(e)=> updateVariable(it.id, { default: e.target.value }) }));
  }

  return el('div', { class:'card', oncontextmenu:(e)=>{ e.preventDefault(); openContextMenu(e.pageX, e.pageY, cm); } },
    el('div', { class:'row between' },
      el('div', { class:'row' }, el('span', { class:'badge' }, it.type||'text'), el('span', { class:'small' }, `#${it.id}`)),
      el('div', {}, el('button', { class:'btn secondary', onclick: ()=> startWizard(it) }, 'Edit'), el('button', { class:'btn secondary', onclick: ()=> deleteVariable(it.id) }, 'Delete'))
    ),
    el('div', { class:'row' },
      el('input', { class:'input', value: it.name, oninput:(e)=> updateVariable(it.id, { name: e.target.value }) }),
      typeInput,
      typeList
    ),
    el('div', {}, el('input', { class:'input', value: it.default||'', oninput:(e)=> updateVariable(it.id, { default: e.target.value }) })),
    ...ext
  );
}

function datalist(){
  return el('datalist', { id:'varTypes' },
    el('option', { value:'text' }),
    el('option', { value:'textarea' }),
    el('option', { value:'number' }),
    el('option', { value:'date' }),
    el('option', { value:'select' }),
    el('option', { value:'prompt' }),
    el('option', { value:'file' }),
    el('option', { value:'form' }),
    el('option', { value:'formatDate' }),
    el('option', { value:'boolean' }),
    el('option', { value:'json' })
  );
}

/* Wizard UI */

function Stepper(){
  const steps = [
    { n:1, label:'Name' },
    { n:2, label:'Type' },
    { n:3, label:'Content' }
  ];
  return WizardStepper(steps, wizard.step);
}

function openContentEditorWithin(body){
  const d = wizard.draft;
  body.appendChild(el('label', {}, 'Default value or pattern'));
  body.appendChild(MarkdownEditor({ value:d.default||'', oninput:(v)=>{ d.default = v; } }));
  if (d.type === 'select'){
    body.appendChild(el('div', { class:'small' }, 'Options (comma separated)'));
    body.appendChild(el('input', { class:'input', placeholder:'one, two, three', value:(d.options||[]).join(', '), oninput:(e)=>{ d.options = e.target.value.split(',').map(s=>s.trim()).filter(Boolean); } }));
  }
  if (d.type === 'formatDate'){
    body.appendChild(el('div', { class:'small' }, 'Format tokens: %Y year, %m month, %d day. Example: %Y-%m-%d.'));
  }
  if (d.type === 'form'){
    const forms = getState().data.forms || [];
    body.appendChild(el('div', { class:'small' }, 'Linked form'));
    body.appendChild(el('select', { class:'input', onchange:(e)=>{ d.linkedFormId = Number(e.target.value)||null; } },
      el('option', { value:'' }, 'Select form...'),
      ...forms.map(f => el('option', { value:String(f.id), selected:d.linkedFormId===f.id }, `#${f.id} ${f.name}`))
    ));
  }
  if (d.type === 'prompt'){
    const prompts = getState().prompts || [];
    body.appendChild(el('div', { class:'small' }, 'Linked prompt'));
    body.appendChild(el('select', { class:'input', onchange:(e)=>{ d.linkedPromptId = Number(e.target.value)||null; } },
      el('option', { value:'' }, 'Select saved prompt...'),
      ...prompts.map(p => el('option', { value:String(p.id), selected:d.linkedPromptId===p.id }, `#${p.id} ${p.name}`))
    ));
  }
}

function openVariableWizardModal(){
  const box = el('div', {});
  box.appendChild(Stepper());
  const name = el('div', {},
    el('label', {}, 'Variable name'),
    el('input', { class:'input', placeholder:'e.g. customer_name', value: wizard.draft.name, oninput:(e)=>{ wizard.draft.name = e.target.value; } }),
    el('div', { class:'row' }, el('button', { class:'btn', onclick: ()=>{ if (!wizard.draft.name.trim()) return; wizard.step = 2; rerender(); } }, 'Next'))
  );
  const type = el('div', {},
    el('label', {}, 'Type'),
    el('select', { class:'input', onchange:(e)=>{ wizard.draft.type = e.target.value; } },
      ...['text','textarea','number','date','select','prompt','file','form','formatDate','boolean','json'].map(t => el('option', { value:t, selected: wizard.draft.type===t }, t))
    ),
    el('div', { class:'row' }, el('button', { class:'btn', onclick: ()=>{ wizard.step = 3; rerender(); } }, 'Next'))
  );
  const content = el('div', {}); openContentEditorWithin(content);

  const stepWrap = el('div', {});
  function rerender(){
    stepWrap.innerHTML = '';
    stepWrap.appendChild(Stepper());
    stepWrap.appendChild(wizard.step===1 ? name : wizard.step===2 ? type : content);
  }
  rerender();

  openModal({
    title: wizard.draft.id ? 'Edit Variable' : 'New Variable',
    body: stepWrap,
    actions: [
      el('button', { class:'btn secondary', onclick: closeModal }, 'Cancel'),
      el('button', { class:'btn', onclick: ()=>{ saveWizard().then(()=> closeModal()); } }, 'Save')
    ]
  });
}

function librarySidebar(){
  const list = applyFilter(getState().data.variables || []);
  const wrap = el('div', { class:'card' }, el('h3', {}, 'Library'));
  if (!list.length){
    wrap.appendChild(el('div', { class:'small' }, 'No variables yet.'));
    return wrap;
  }
  list.forEach(v=>{
    wrap.appendChild(el('div', { class:'row' },
      el('button', { class:'btn secondary', onclick: ()=> startWizard(v) }, `${v.name}  #${v.id}`)
    ));
  });
  return wrap;
}

function wizardHint(){
  return el('div', { class:'card' },
    el('h3', {}, 'Wizard'),
    el('div', { class:'row' }, el('button', { class:'btn', onclick: ()=> startWizard() }, 'Open variable wizard'))
  );
}

export function render(){
  const main = el('div', {});
  main.appendChild(header());
  main.appendChild(toolbar());
  main.appendChild(wizardHint());
  main.appendChild(list());
  return withSidebar(librarySidebar(), main);
}
