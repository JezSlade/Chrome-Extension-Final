// ui/modules/expansions.js
// Rebranded in UI as "Cues". Keeps id to preserve manager wiring.
import { el, rpc, getState, setState, Toolbar, applyFilter, showToast, openContextMenu, openModal, closeModal, withSidebar, MarkdownEditor, triggerAutoSyncPush, WizardStepper } from '../utils.js';

export const id = 'expansions';
export const label = 'Cues';

// Local editor state for Cue composer
let cueWiz = {
  open: false,
  editingId: null,
  trigger: '',
  body: ''
};

function toolbar(){
  return Toolbar({
    buttons: [
      el('button', { class:'btn', onclick: startNew }, 'New Cue')
    ]
  });
}

function startNew(){
  cueWiz = { open: true, editingId: null, trigger: '', body: '' };
  openCueEditorModal('New Cue');
  setState({});
}

async function editExisting(exp){
  cueWiz = {
    open: true,
    editingId: exp.id,
    trigger: exp.trigger || '',
    body: String(exp.replacement || '')
  };
  openCueEditorModal('Edit Cue');
  setState({});
}

async function saveCue(){
  const trig = (cueWiz.trigger || '').trim();
  const body = (cueWiz.body || '').trim();
  if (!trig){ showToast('Trigger required'); return; }
  if (!body){ showToast('Body required'); return; }

  if (cueWiz.editingId){
    await rpc('UPDATE_EXPANSION', { id: cueWiz.editingId, patch: { trigger: trig, replacement: body } });
  } else {
    await rpc('ADD_EXPANSION', { item: { trigger: trig, replacement: body, type: 'text' } });
  }
  cueWiz = { open:false, editingId:null, trigger:'', body:'' };
  const st = await rpc('GET_STATE');
  setState({ data: st.data });
  triggerAutoSyncPush();
  showToast('Saved');
}

/* ---------- List & cards ---------- */
function list(){
  const items = applyFilter(getState().data.expansions || []);
  return el('div', { class:'grid cols-2 list' }, ...items.map(card));
}

function card(it){
  const cm = [
    { label:'Edit (Cue editor)', onClick: ()=> editExisting(it) },
    { label:'Duplicate', onClick: async ()=>{ const copy = Object.assign({}, it, { id: undefined, trigger: (it.trigger||'')+'_copy' }); await rpc('ADD_EXPANSION', { item: copy }); const st = await rpc('GET_STATE'); setState({ data: st.data }); triggerAutoSyncPush(); } },
    { label:'Delete', onClick: ()=> remove(it.id) }
  ];
  return el('div', { class:'card', oncontextmenu:(e)=>{ e.preventDefault(); openContextMenu(e.pageX, e.pageY, cm); } },
    el('div', { class:'row between' },
      el('div', { class:'row' }, el('span', { class:'badge' }, 'cue'), el('span', { class:'small' }, `#${it.id}`)),
      el('div', {},
        el('button', { class:'btn secondary', onclick: ()=> editExisting(it) }, 'Edit'),
        el('button', { class:'btn secondary', onclick: ()=> remove(it.id) }, 'Delete')
      )
    ),
    el('div', { class:'row' },
      el('label', {}, 'Trigger'),
      el('input', { class:'input', value: it.trigger || '', placeholder: ':trigger', oninput:(e)=> inlineUpdate(it.id, { trigger: e.target.value }) })
    ),
    el('div', {}, el('textarea', { oninput:(e)=> inlineUpdate(it.id, { replacement: e.target.value }) }, it.replacement||''))
  );
}

async function inlineUpdate(id, patch){
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

/* ---------- Cue editor (single large editor with toolbars) ---------- */

function insertAtCursor(ta, token){
  const s = ta.selectionStart || 0, e = ta.selectionEnd || 0;
  const val = ta.value;
  ta.value = val.slice(0, s) + token + val.slice(e);
  const pos = s + token.length;
  ta.focus();
  ta.setSelectionRange(pos, pos);
  ta.dispatchEvent(new Event('input', { bubbles:true }));
}

function openInsertInputModal(ta){
  const body = el('div', {},
    el('label', {}, 'Label'),
    el('input', { class:'input', placeholder:'Your label', value:'', id:'insLabel' }),
    el('label', {}, 'Key (optional)'),
    el('input', { class:'input', placeholder:'key_name', value:'', id:'insKey' })
  );
  openModal({
    title: 'Insert: User Input',
    body,
    actions: [
      el('button', { class:'btn secondary', onclick: closeModal }, 'Cancel'),
      el('button', { class:'btn', onclick: ()=>{
        const lbl = body.querySelector('#insLabel').value.trim() || 'Input';
        const key = body.querySelector('#insKey').value.trim();
        const token = key ? `{{input:${key}|${lbl}}}` : `{{input:${lbl}}}`;
        closeModal();
        insertAtCursor(ta, token);
      } }, 'Insert')
    ]
  });
}

function openInsertSelectModal(ta){
  const body = el('div', {},
    el('label', {}, 'Label'),
    el('input', { class:'input', placeholder:'Select label', value:'', id:'selLabel' }),
    el('label', {}, 'Options (comma separated)'),
    el('input', { class:'input', placeholder:'one, two, three', value:'', id:'selOpts' })
  );
  openModal({
    title: 'Insert: Dropdown',
    body,
    actions: [
      el('button', { class:'btn secondary', onclick: closeModal }, 'Cancel'),
      el('button', { class:'btn', onclick: ()=>{
        const lbl = body.querySelector('#selLabel').value.trim() || 'Select';
        const opts = (body.querySelector('#selOpts').value || '').split(',').map(s=>s.trim()).filter(Boolean);
        const token = `{{select:${lbl}|${opts.join('|')}}}`;
        closeModal();
        insertAtCursor(ta, token);
      } }, 'Insert')
    ]
  });
}

function openInsertDateModal(ta){
  const body = el('div', {},
    el('label', {}, 'Format'),
    el('input', { class:'input', value:'%Y-%m-%d', id:'fmt' }),
    el('div', { class:'small' }, 'Tokens: %Y year, %m month, %d day, %H hour, %M minute, %S second.')
  );
  openModal({
    title: 'Insert: Date/Time',
    body,
    actions: [
      el('button', { class:'btn secondary', onclick: closeModal }, 'Cancel'),
      el('button', { class:'btn', onclick: ()=>{
        const fmt = body.querySelector('#fmt').value || '%Y-%m-%d';
        closeModal();
        insertAtCursor(ta, `{{date:+${fmt}}}`);
      } }, 'Insert')
    ]
  });
}

function openInsertVariableModal(ta){
  const vars = (getState().data.variables || []);
  const body = el('div', {},
    el('label', {}, 'Pick variable'),
    el('select', { class:'input', id:'varPick' },
      el('option', { value:'' }, 'Select...'),
      ...vars.map(v => el('option', { value:v.name }, `${v.name} (${v.type||'text'})`))
    )
  );
  openModal({
    title: 'Insert: Variable',
    body,
    actions: [
      el('button', { class:'btn secondary', onclick: closeModal }, 'Cancel'),
      el('button', { class:'btn', onclick: ()=>{
        const name = body.querySelector('#varPick').value;
        if (name) insertAtCursor(ta, `{{${name}}}`);
        closeModal();
      } }, 'Insert')
    ]
  });
}

function openInsertAIElementModal(ta){
  // Simple persona + optional template selector. Produces a portable token.
  const state = getState();
  const tplMap = (state.promptData && state.promptData.templates) || {};
  const personaList = [
    'Market Analyst',
    'Technical Writer',
    'Customer Support'
  ];
  const body = el('div', {},
    el('label', {}, 'Persona'),
    el('select', { class:'input', id:'aiPersona' },
      ...personaList.map(p => el('option', { value:p }, p))
    ),
    el('label', {}, 'Template (optional)'),
    el('select', { class:'input', id:'aiTpl' },
      el('option', { value:'' }, 'None'),
      ...Object.entries(tplMap).map(([k,v]) => el('option', { value:k }, v.label || k))
    )
  );
  openModal({
    title: 'Insert: AI Element',
    body,
    actions: [
      el('button', { class:'btn secondary', onclick: closeModal }, 'Cancel'),
      el('button', { class:'btn', onclick: ()=>{
        const persona = body.querySelector('#aiPersona').value;
        const tpl = body.querySelector('#aiTpl').value;
        const token = tpl ? `{{ai persona="${persona}" template="${tpl}"}}` : `{{ai persona="${persona}"}}`;
        closeModal();
        insertAtCursor(ta, token);
      } }, 'Insert')
    ]
  });
}

function cueEditorBody(){
  const wrap = el('div', {});
  // Trigger input
  wrap.appendChild(el('div', { class:'row' },
    el('label', {}, 'Trigger'),
    el('input', { class:'input', placeholder:':trigger', value: cueWiz.trigger || '', oninput:(e)=>{ cueWiz.trigger = e.target.value; } })
  ));

  // Main Markdown editor
  const editor = MarkdownEditor({
    value: cueWiz.body || '',
    oninput: (v)=>{ cueWiz.body = v; },
    focusKey: 'cue-body'
  });
  const ta = editor._textarea;

  // Form Elements toolbar
  const formBar = el('div', { class:'row', style:'margin:6px 0' },
    el('button', { class:'btn', onclick: ()=> openInsertInputModal(ta) }, 'Insert Input'),
    el('button', { class:'btn', onclick: ()=> openInsertSelectModal(ta) }, 'Insert Dropdown'),
    el('button', { class:'btn', onclick: ()=> openInsertDateModal(ta) }, 'Insert Date'),
    el('button', { class:'btn', onclick: ()=> openInsertVariableModal(ta) }, 'Insert Variable'),
    el('button', { class:'btn', onclick: ()=> insertAtCursor(ta, '{{clipboard}}') }, 'Insert Clipboard'),
    el('button', { class:'btn', onclick: ()=> insertAtCursor(ta, '{{uuid}}') }, 'Insert UUID'),
    el('button', { class:'btn', onclick: ()=> insertAtCursor(ta, '{{cursor}}') }, 'Insert Cursor')
  );

  // AI Elements toolbar
  const aiBar = el('div', { class:'row', style:'margin:6px 0' },
    el('button', { class:'btn', onclick: ()=> openInsertAIElementModal(ta) }, 'Insert AI Element')
  );

  wrap.appendChild(formBar);
  wrap.appendChild(aiBar);
  wrap.appendChild(editor);

  return wrap;
}

function openCueEditorModal(title){
  const body = cueEditorBody();
  openModal({
    title: title || 'Cue',
    body,
    actions: [
      el('button', { class:'btn secondary', onclick: closeModal }, 'Close'),
      el('button', { class:'btn', onclick: ()=>{ saveCue().then(()=> closeModal()); } }, 'Save')
    ]
  });
}

/* ---------- Library sidebar ---------- */
function librarySidebar(){
  const list = applyFilter(getState().data.expansions || []);
  const side = el('div', { class:'card' }, el('h3', {}, 'Cues'));
  if (!list.length){
    side.appendChild(el('div', { class:'small' }, 'No cues yet.'));
    return side;
  }
  list.forEach(ex => {
    side.appendChild(el('div', { class:'row' },
      el('button', { class:'btn secondary', onclick: ()=> editExisting(ex) }, `${ex.trigger || '(no trigger)'}  #${ex.id}`)
    ));
  });
  return side;
}

export function render(){
  const main = el('div', {});
  main.appendChild(el('div', { class:'card' }, el('h3', {}, 'ToolForge — Cues')));
  main.appendChild(toolbar());
  main.appendChild(list());
  return withSidebar(librarySidebar(), main);
}
