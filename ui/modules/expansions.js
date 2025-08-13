// ui/modules/expansions.js
// Rebranded in UI as "Cues". Keeps id to preserve manager wiring.
import { el, rpc, getState, setState, Toolbar, applyFilter, showToast, withSidebar, triggerAutoSyncPush, WizardStepper } from '../utils.js';
import * as U from '../utils.js';

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
  const s = getState();
  const left = el('div', { class:'row gap' },
    el('button', { class:'btn', onclick: ()=> openCueEditorModal('New Cue') }, 'New'),
    el('button', { class:'btn secondary', onclick: reload }, 'Refresh')
  );
  const right = el('div', { class:'row' },
    el('input', { class:'input', placeholder:'Filter...', value:s.filter || '', oninput:(e)=> setState({ filter: e.target.value }) })
  );
  return Toolbar({ left, right });
}

async function reload(){
  await rpc('LIST_EXPANSIONS');
}

function list(){
  const s = getState();
  const items = applyFilter(s.expansions || []).slice(0, 500);
  if (!items.length) return el('div', { class:'card' }, 'No cues yet.');
  const ul = el('div', { class:'list' });
  items.forEach(ex => {
    ul.appendChild(el('div', { class:'list-item' },
      el('div', { class:'flex-1' }, ex.trigger || '(no trigger)'),
      el('div', { class:'row' },
        el('button', { class:'btn secondary', onclick: ()=> editExisting(ex) }, 'Edit'),
        el('button', { class:'btn danger', onclick: ()=> remove(ex.id) }, 'Delete'),
      )
    ));
  });
  return el('div', { class:'card' }, ul);
}

function insertAtCursor(ta, text){
  const s = ta.selectionStart || 0;
  const e = ta.selectionEnd || 0;
  const val = ta.value;
  ta.value = val.slice(0, s) + text + val.slice(e);
  const pos = s + text.length;
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
        const label = body.querySelector('#insLabel').value.trim() || 'Your input';
        const key = body.querySelector('#insKey').value.trim();
        const token = key ? `{{input label="${label}" key="${key}"}}` : `{{input label="${label}"}}`;
        closeModal();
        insertAtCursor(ta, token);
      } }, 'Insert')
    ]
  });
}

function openInsertVariableModal(ta){
  const s = getState();
  const vars = (s.variables || []).map(v => [v.name, v.name]).slice(0, 200);
  const body = el('div', {},
    el('label', {}, 'Variable'),
    U.select(vars, { id:'varName' })
  );
  openModal({
    title: 'Insert: Variable',
    body,
    actions: [
      el('button', { class:'btn secondary', onclick: closeModal }, 'Cancel'),
      el('button', { class:'btn', onclick: ()=>{
        const varName = body.querySelector('#varName').value;
        closeModal();
        insertAtCursor(ta, `{{var ${varName}}}`);
      } }, 'Insert')
    ]
  });
}

function openInsertAIElementModal(ta){
  const s = getState();
  const personas = (s.prompts || []).filter(p => p.type === 'persona').map(p => [p.name, p.name]);
  const templates = (s.prompts || []).filter(p => p.type === 'template').map(p => [p.name, p.name]);
  const body = el('div', {},
    el('label', {}, 'Persona'),
    U.select(personas, { id:'aiPersona' }),
    el('label', {}, 'Template'),
    U.select(templates, { id:'aiTpl' })
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
  const trigger = el('input', { class:'input', placeholder:':trigger', value: cueWiz.trigger || '' });
  wrap.appendChild(el('div', { class:'row' }, el('label', { class:'label' }, 'Trigger'), trigger));

  // Markdown editor for body
  const editor = U.MarkdownEditor({
    value: cueWiz.body || '',
    oninput:(text)=> cueWiz.body = text
  });

  // Insert toolbar
  const ta = editor.querySelector('textarea');
  const bar = el('div', { class:'row wrap gap' },
    el('button', { class:'btn secondary', onclick: ()=> openInsertInputModal(ta) }, 'User Input'),
    el('button', { class:'btn secondary', onclick: ()=> openInsertVariableModal(ta) }, 'Variable'),
    el('button', { class:'btn secondary', onclick: ()=> openInsertAIElementModal(ta) }, 'AI Element')
  );

  wrap.appendChild(bar);
  wrap.appendChild(editor);
  return wrap;
}

function openCueEditorModal(title){
  const body = cueEditorBody();
  openModal({
    title,
    body,
    actions: [
      el('button', { class:'btn secondary', onclick: closeModal }, 'Cancel'),
      el('button', { class:'btn', onclick: saveCue }, 'Save')
    ]
  });
}

async function saveCue(){
  const s = getState();
  const trigger = document.querySelector('.modal-body input.input').value.trim();
  const ta = document.querySelector('.modal-body textarea');
  const body = ta ? ta.value : '';
  if (!trigger){ showToast('Trigger required'); return; }
  if (!body){ showToast('Body required'); return; }

  if (cueWiz.editingId){
    await rpc('UPDATE_EXPANSION', { id: cueWiz.editingId, patch: { trigger, body } });
  } else {
    await rpc('ADD_EXPANSION', { expansion: { trigger, body } });
  }
  closeModal();
  showToast('Saved');
  triggerAutoSyncPush();
}

function editExisting(ex){
  cueWiz = { open:true, editingId: ex.id, trigger: ex.trigger || '', body: ex.body || '' };
  openCueEditorModal('Edit Cue');
}

async function remove(id){
  await rpc('DELETE_EXPANSION', { id });
  showToast('Removed');
}

function librarySidebar(){
  const side = el('div', { class:'sidebar' });
  side.appendChild(el('div', { class:'sidebar-title' }, 'Cues Library'));
  const s = getState();
  const items = (s.expansions || []).slice(0, 100);
  items.forEach(ex => {
    side.appendChild(el('div', { class:'sidebar-item' },
      el('button', { class:'btn link', onclick: ()=> editExisting(ex) }, `${ex.trigger || '(no trigger)'}  #${ex.id}`)
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

// === CHANGELOG ===
// 2025-08-12: Patch to avoid named export mismatch for MarkdownEditor.
// - Added `import * as U from '../utils.js';`
// - Replaced bare `MarkdownEditor(` calls with `U.MarkdownEditor(`
// Rationale: Some environments reported `utils.js` not providing a named export 'MarkdownEditor' due to stale module caches
// or inconsistent bundling. Using namespace import is robust and avoids breaking named imports.
// No other logic changed.
