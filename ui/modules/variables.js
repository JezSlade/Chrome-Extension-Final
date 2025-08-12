// ui/modules/variables.js
import { el, rpc, getState, setState, Toolbar, applyFilter, showToast, uid, openContextMenu } from '../utils.js';

export const id = 'variables';
export const label = 'Variables';

// Wizard state
let wizard = { open:false, step:1, draft:{ name:'', type:'text', default:'', options:[], linkedFormId:null, linkedPromptId:null } };

function header(){
  return el('div', { class:'card' },
    el('h3', {}, 'Variables'),
    el('div', { class:'small' }, 'Supported tokens:'),
    el('ul', {},
      el('li', {}, 'Static ', el('code', {}, '{{name}}')),
      el('li', {}, 'Date ', el('code', {}, '{{date:+%Y-%m-%d}}')),
      el('li', {}, 'Clipboard ', el('code', {}, '{{clipboard}}')),
      el('li', {}, 'Env ', el('code', {}, '{{env.USER}}')),
      el('li', {}, 'Output ', el('code', {}, '{{output:url}}'), ', ', el('code', {}, '{{output:title}}')),
      el('li', {}, 'Input ', el('code', {}, '{{input:Label}}')),
      el('li', {}, 'UUID ', el('code', {}, '{{uuid}}')),
      el('li', {}, 'Cursor ', el('code', {}, '{{cursor}}')),
      el('li', {}, 'Conditional ', el('code', {}, '{{if name}}...{{endif}}')),
      el('li', {}, 'Regex captures ', el('code', {}, '{{match_1}}'), ', ', el('code', {}, '{{match_2}}'))
    )
  );
}

function toolbar(){
  return Toolbar({ buttons: [ el('button', { class:'btn', onclick: startWizard }, 'New Variable') ] });
}

function startWizard(){
  wizard = { open:true, step:1, draft:{ name:'', type:'text', default:'', options:[], linkedFormId:null, linkedPromptId:null } };
  setState({});
}

async function saveWizard(){
  const d = wizard.draft;
  if (!d.name.trim()){ showToast('Name required'); return; }
  await rpc('ADD_VARIABLE', { item: d });
  wizard = { open:false, step:1, draft:{ name:'', type:'text', default:'', options:[] } };
  await reload();
  showToast('Saved');
}

async function updateVariable(id, patch){ await rpc('UPDATE_VARIABLE', { id, patch }); }
async function deleteVariable(id){ await rpc('DELETE_VARIABLE', { id }); await reload(); showToast('Deleted'); }
async function reload(){ const st = await rpc('GET_STATE'); setState({ data: st.data }); }

function list(){
  const items = applyFilter(getState().data.variables || []);
  return el('div', { class:'grid cols-2 list' }, ...items.map(card));
}

function card(it){
  const cm = [ { label:'Delete', onClick: ()=> deleteVariable(it.id) } ];
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
    ext.push(el('div', { class:'small' }, 'Format string'));
    ext.push(el('input', { class:'input', value: it.default || '%Y-%m-%d', oninput:(e)=> updateVariable(it.id, { default: e.target.value }) }));
  }

  return el('div', { class:'card', oncontextmenu:(e)=>{ openContextMenu(e.pageX, e.pageY, cm); } },
    el('div', { class:'row between' },
      el('div', { class:'row' }, el('span', { class:'badge' }, it.type||'text'), el('span', { class:'small' }, `#${it.id}`)),
      el('div', {}, el('button', { class:'btn secondary', onclick: ()=> deleteVariable(it.id) }, 'Delete'))
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
  return el('div', { class:'stepper' },
    ...steps.map(s => el('div', { class:'step' + (wizard.step === s.n ? ' active' : '') }, `${s.n}. ${s.label}`))
  );
}

function wizardView(){
  if (!wizard.open) return null;
  return el('div', { class:'card' },
    el('h3', {}, 'New Variable'),
    Stepper(),
    wizard.step === 1 ? nameStep() : null,
    wizard.step === 2 ? typeStep() : null,
    wizard.step === 3 ? contentStep() : null,
    el('div', { class:'divider' }),
    el('div', { class:'row' },
      el('button', { class:'btn secondary', onclick: ()=>{ wizard.open=false; setState({}); } }, 'Cancel'),
      el('button', { class:'btn', onclick: saveWizard }, 'Save')
    )
  );
}

function nameStep(){
  return el('div', {},
    el('label', {}, 'Variable name'),
    el('input', { class:'input', placeholder:'e.g. customer_name', value: wizard.draft.name, oninput:(e)=>{ wizard.draft.name = e.target.value; } }),
    el('div', { class:'row' }, el('button', { class:'btn', onclick: ()=>{ if (!wizard.draft.name.trim()) return; wizard.step = 2; setState({}); } }, 'Next'))
  );
}

function typeStep(){
  const types = ['text','textarea','number','date','select','prompt','file','form','formatDate','boolean','json'];
  return el('div', {},
    el('label', {}, 'Type'),
    el('select', { class:'input', onchange:(e)=>{ wizard.draft.type = e.target.value; } },
      ...types.map(t => el('option', { value:t, selected: wizard.draft.type===t }, t))
    ),
    el('div', { class:'row' }, el('button', { class:'btn', onclick: ()=>{ wizard.step = 3; setState({}); } }, 'Next'))
  );
}

function contentStep(){
  const d = wizard.draft;
  const wrap = el('div', {});
  // Common default
  wrap.appendChild(el('div', {}, el('label', {}, 'Default'), el('input', { class:'input', value:d.default||'', oninput:(e)=>{ d.default = e.target.value; } })));

  if (d.type === 'select'){
    wrap.appendChild(el('div', { class:'small' }, 'Options (comma separated)'));
    wrap.appendChild(el('input', { class:'input', placeholder:'one, two, three', oninput:(e)=>{ d.options = e.target.value.split(',').map(s=>s.trim()).filter(Boolean); } }));
  }
  if (d.type === 'form'){
    const forms = getState().data.forms || [];
    wrap.appendChild(el('div', { class:'small' }, 'Linked form'));
    wrap.appendChild(el('select', { class:'input', onchange:(e)=>{ d.linkedFormId = Number(e.target.value)||null; } },
      el('option', { value:'' }, 'Select form...'),
      ...forms.map(f => el('option', { value:String(f.id) }, `#${f.id} ${f.name}`))
    ));
  }
  if (d.type === 'prompt'){
    const prompts = getState().prompts || [];
    wrap.appendChild(el('div', { class:'small' }, 'Linked prompt'));
    wrap.appendChild(el('select', { class:'input', onchange:(e)=>{ d.linkedPromptId = Number(e.target.value)||null; } },
      el('option', { value:'' }, 'Select saved prompt...'),
      ...prompts.map(p => el('option', { value:String(p.id) }, `#${p.id} ${p.name}`))
    ));
  }
  if (d.type === 'formatDate'){
    wrap.appendChild(el('div', { class:'small' }, 'Format string like %Y-%m-%d'));
  }

  return wrap;
}

export function render(){
  const wrap = el('div', {});
  wrap.appendChild(header());
  wrap.appendChild(toolbar());
  const w = wizardView();
  if (w) wrap.appendChild(w);
  wrap.appendChild(list());
  return wrap;
}
