// ui/modules/variables.js
import { el, rpc, getState, setState, Toolbar, applyFilter, showToast, uid, openContextMenu } from '../utils.js';
export const id = 'variables';
export const label = 'Variables';
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
  return Toolbar({ buttons: [ el('button', { class:'btn', onclick: addVariable }, 'Add Variable') ] });
}
async function addVariable(){
  const item = { name: 'newVar', type: 'text', default: '' };
  await rpc('ADD_VARIABLE', { item });
  await reload();
  setState({ tab: 'variables' });
  showToast('Added');
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
export function render(){
  const wrap = el('div', {});
  wrap.appendChild(header());
  wrap.appendChild(toolbar());
  wrap.appendChild(list());
  return wrap;
}
