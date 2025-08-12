// ui/modules/prompts.js
// Refocused as Element Configuration for AI-related defaults and prompt templates.
// Keeps id and RPCs intact. Still allows saving prompts, but primary use is to manage AI defaults used by Cue insertions.
import { el, rpc, getState, setState, Toolbar, applyFilter, showToast, openModal, closeModal, withSidebar, MarkdownEditor, triggerAutoSyncPush, WizardStepper } from '../utils.js';

export const id = 'prompts';
export const label = 'Element Configuration (AI)';

function toolbar(){ return Toolbar({ buttons: [ el('button', { class:'btn', onclick: ()=> openPersonaDefaultsModal() }, 'Edit Persona Defaults') ] }); }

const PERSONAS = [
  { id:'Market Analyst', system:'You are a market analyst specializing in short term trading.' },
  { id:'Technical Writer', system:'You write precise technical documentation for developers.' },
  { id:'Customer Support', system:'You are a calm, helpful support agent focused on resolving issues quickly.' }
];

// In-memory persona defaults editable here
let personaDefaults = {
  'Market Analyst': 'You are a market analyst specializing in short term trading.',
  'Technical Writer': 'You write precise technical documentation for developers.',
  'Customer Support': 'You are a calm, helpful support agent focused on resolving issues quickly.'
};

function openPersonaDefaultsModal(){
  const body = el('div', {});
  PERSONAS.forEach(p=>{
    body.appendChild(el('label', {}, `${p.id} system prompt`));
    const ed = MarkdownEditor({ value: personaDefaults[p.id] || '', oninput:(v)=>{ personaDefaults[p.id] = v; } });
    body.appendChild(ed);
    body.appendChild(el('div', { class:'divider' }));
  });
  openModal({
    title: 'Persona Defaults',
    body,
    actions: [
      el('button', { class:'btn secondary', onclick: closeModal }, 'Close'),
      el('button', { class:'btn', onclick: ()=>{ closeModal(); showToast('Saved'); } }, 'Save')
    ]
  });
}

/* Optional: simple prompt library remains for reuse */
async function addPrompt(item){
  const { id } = await rpc('ADD_PROMPT', { item });
  const pr = await rpc('LIST_PROMPTS');
  setState({ prompts: pr.items });
  triggerAutoSyncPush();
  showToast('Saved');
  return id;
}
async function updatePrompt(id, patch){
  await rpc('UPDATE_PROMPT', { id, patch });
  const pr = await rpc('LIST_PROMPTS');
  setState({ prompts: pr.items });
  triggerAutoSyncPush();
}

function promptList(){
  const items = applyFilter(getState().prompts || []);
  return el('div', { class:'grid cols-2 list' }, ...items.map(p => el('div', { class:'card' },
    el('div', { class:'row between' },
      el('strong', {}, p.name),
      el('div', {},
        el('button', { class:'btn secondary', onclick: async ()=>{ await navigator.clipboard.writeText(p.rendered||''); showToast('Copied'); } }, 'Copy'),
        el('button', { class:'btn secondary', onclick: async ()=>{ await rpc('DELETE_PROMPT', { id: p.id }); const pr = await rpc('LIST_PROMPTS'); setState({ prompts: pr.items }); triggerAutoSyncPush(); showToast('Deleted'); } }, 'Delete')
      )
    ),
    el('div', { class:'row' },
      el('label', {}, 'Name'),
      el('input', { class:'input', value: p.name || '', oninput:(e)=> updatePrompt(p.id, { name: e.target.value }) }),
      el('label', { style:'margin-left:8px' }, 'Trigger'),
      el('input', { class:'input', placeholder:':prompt_trigger', value: p.trigger || '', oninput:(e)=> updatePrompt(p.id, { trigger: e.target.value }) })
    ),
    el('textarea', {}, p.rendered||'')
  )));
}

function templatesSidebar(){
  const state = getState();
  const tplMap = (state.promptData && state.promptData.templates) || {};
  const wrap = el('div', { class:'card' }, el('h3', {}, 'Prompt Templates'));
  const keys = Object.keys(tplMap);
  if (!keys.length){ wrap.appendChild(el('div', { class:'small' }, 'No templates found.')); return wrap; }
  keys.forEach(k=>{
    const v = tplMap[k];
    wrap.appendChild(el('div', { class:'row' }, el('button', { class:'btn secondary' }, v.label || k)));
  });
  return wrap;
}

export function render(){
  const main = el('div', {});
  main.appendChild(el('div', { class:'card' }, el('h3', {}, 'Element Configuration — AI')));
  main.appendChild(el('div', { class:'small' }, 'Edit persona defaults and manage saved prompts used by AI tokens in Cues.'));
  main.appendChild(toolbar());
  main.appendChild(el('hr', { class:'divider' }));
  main.appendChild(el('div', { class:'card' }, el('h3', {}, 'Saved Prompts')));
  main.appendChild(promptList());
  const sidebar = el('div', {}, templatesSidebar());
  return withSidebar(sidebar, main);
}
