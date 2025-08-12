// ui/modules/prompts.js
// AI Element Library — grouped per AI provider/model with CRUD and element types.
// Minimal, targeted refactor: keeps existing RPCs (LIST_PROMPTS, ADD_PROMPT, UPDATE_PROMPT, DELETE_PROMPT).
// Adds library sections and support for element categories (Instruction, Context, Constraints, Exemplars, Role, Output Format, Chain-of-Thought).

import { el, rpc, getState, setState, Toolbar, applyFilter, showToast, openModal, closeModal, MarkdownEditor, triggerAutoSyncPush, WizardStepper, groupPromptsByAI, normalizeName, isValidName, ensureUniqueName } from '../utils.js';

export const id = 'prompts';
export const label = 'Element Configuration (AI)';

const ELEMENT_TYPES = [
  'Instruction',
  'Context',
  'Constraints',
  'Exemplars',
  'Role',
  'Output Format',
  'Chain-of-Thought'
];

function toolbar(){
  return Toolbar({
    title: 'AI Element Library',
    buttons: [ el('button', { class:'btn', onclick: ()=> openNewPromptWizard() }, 'New AI Element') ]
  });
}

function getAll(){ return (getState().prompts || []); }
async function reload(){ const pr = await rpc('LIST_PROMPTS'); setState({ prompts: pr.items }); }

async function addPrompt(item){ await rpc('ADD_PROMPT', { item }); await reload(); triggerAutoSyncPush(); showToast('AI element added'); }
async function updatePrompt(id, patch){ await rpc('UPDATE_PROMPT', { id, patch }); await reload(); triggerAutoSyncPush(); }
async function deletePrompt(id){ await rpc('DELETE_PROMPT', { id }); await reload(); triggerAutoSyncPush(); }

/* ------------------------------------------------------------
   Wizard (new element)
------------------------------------------------------------ */
let wiz = { open:false, step:1, draft:{ name:'', provider:'OpenAI', model:'gpt-4o', type:'Instruction', content:'', variations:[] } };

function openNewPromptWizard(){
  wiz = { open:true, step:1, draft:{ name:'', provider:'OpenAI', model:'gpt-4o', type:'Instruction', content:'', variations:[] } };
  const { close, content } = openModal({ title:'New AI Element', body: el('div',{}) });
  const render = ()=>{
    content.innerHTML = '';
    content.appendChild(WizardStepper({ steps:['Basics','Body','Variations'], current: wiz.step }));

    if (wiz.step === 1){
      const d = wiz.draft;
      content.appendChild(el('label', {}, 'Human‑readable name'));
      content.appendChild(el('input', { class:'input', placeholder:'e.g., Beginner‑friendly explainer', value:d.name, oninput:(e)=> d.name = e.target.value }));

      content.appendChild(el('div', { class:'grid cols-2 gap' },
        el('div', {},
          el('label', {}, 'Element Type'),
          el('select', { class:'input', onchange:(e)=> d.type = e.target.value }, ...ELEMENT_TYPES.map(t => el('option', { value:t, selected:d.type===t }, t)))
        ),
        el('div', {},
          el('label', {}, 'Provider • Model'),
          el('div', { class:'row gap' },
            el('input', { class:'input', placeholder:'Provider (e.g., OpenAI, Anthropic)', value:d.provider, oninput:(e)=> d.provider=e.target.value }),
            el('input', { class:'input', placeholder:'Model (e.g., gpt‑4o, claude‑3.5)', value:d.model, oninput:(e)=> d.model=e.target.value })
          )
        )
      ));

      content.appendChild(el('div', { class:'row end' }, el('button', { class:'btn', onclick: ()=>{
        if (!isValidName(d.name)) { showToast('Please enter a valid name.'); return; }
        const existing = getAll().map(x => x.name).filter(Boolean);
        d.name = ensureUniqueName(normalizeName(d.name), existing);
        wiz.step = 2; render();
      } }, 'Next')));
    }
    else if (wiz.step === 2){
      const d = wiz.draft;
      content.appendChild(el('label', {}, `${d.type} — Content`));
      content.appendChild(MarkdownEditor({ value:d.content, oninput:(v)=> d.content = v }));
      content.appendChild(el('div', { class:'row between' },
        el('button', { class:'btn secondary', onclick: ()=>{ wiz.step=1; render(); } }, 'Back'),
        el('button', { class:'btn', onclick: ()=>{ wiz.step=3; render(); } }, 'Next')
      ));
    }
    else if (wiz.step === 3){
      const d = wiz.draft;
      content.appendChild(el('div', { class:'small' }, 'Add optional variations; each is a small tweak selectable during insertion.'));
      const list = el('div', { class:'stack gap' });
      (d.variations||[]).forEach((v, idx)=>{
        const row = el('div', { class:'row gap' },
          el('input', { class:'input', placeholder:'Variation name', value:v.name||'', oninput:(e)=> v.name = e.target.value }),
          el('input', { class:'input', placeholder:'Short hint / modifier', value:v.hint||'', oninput:(e)=> v.hint = e.target.value }),
          el('button', { class:'btn danger', onclick: ()=>{ d.variations.splice(idx,1); render(); } }, 'Remove')
        );
        list.appendChild(row);
      });
      content.appendChild(list);
      content.appendChild(el('button', { class:'btn secondary', onclick: ()=>{ (d.variations||(d.variations=[])).push({ name:'New Variation', hint:'' }); render(); } }, 'Add Variation'));

      content.appendChild(el('div', { class:'row between' },
        el('button', { class:'btn secondary', onclick: ()=>{ wiz.step=2; render(); } }, 'Back'),
        el('button', { class:'btn', onclick: async ()=>{ await addPrompt(wiz.draft); close(); } }, 'Create')
      ));
    }
  };
  render();
}

/* ------------------------------------------------------------
   Cards & Grouped Library
------------------------------------------------------------ */
function card(it){
  const meta = el('div', { class:'small' }, `${it.type || 'Instruction'} • ${it.provider || 'default'}${it.model ? ' / ' + it.model : ''}`);
  const body = el('div', { class:'muted' }, (it.content && it.content.slice(0, 240)) || '—');
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
  const { close, content } = openModal({ title:`Edit • ${d.name||'AI Element'}`, body: el('div',{}) });
  const render = ()=>{
    content.innerHTML = '';
    content.appendChild(el('label', {}, 'Name'));
    content.appendChild(el('input', { class:'input', value:d.name||'', oninput:(e)=> d.name = e.target.value }));

    content.appendChild(el('div', { class:'grid cols-2 gap' },
      el('div', {},
        el('label', {}, 'Element Type'),
        el('select', { class:'input', onchange:(e)=> d.type = e.target.value }, ...ELEMENT_TYPES.map(t => el('option', { value:t, selected:d.type===t }, t)))
      ),
      el('div', {},
        el('label', {}, 'Provider • Model'),
        el('div', { class:'row gap' },
          el('input', { class:'input', value:d.provider||'', oninput:(e)=> d.provider=e.target.value }),
          el('input', { class:'input', value:d.model||'', oninput:(e)=> d.model=e.target.value })
        )
      )
    ));

    content.appendChild(el('label', {}, `${d.type || 'Instruction'} — Content`));
    content.appendChild(MarkdownEditor({ value:d.content||'', oninput:(v)=> d.content = v }));

    // Variations editor
    const list = el('div', { class:'stack gap' });
    (d.variations||[]).forEach((v, idx)=>{
      const row = el('div', { class:'row gap' },
        el('input', { class:'input', placeholder:'Variation name', value:v.name||'', oninput:(e)=> v.name = e.target.value }),
        el('input', { class:'input', placeholder:'Short hint / modifier', value:v.hint||'', oninput:(e)=> v.hint = e.target.value }),
        el('button', { class:'btn danger', onclick: ()=>{ d.variations.splice(idx,1); render(); } }, 'Remove')
      );
      list.appendChild(row);
    });
    content.appendChild(list);
    content.appendChild(el('button', { class:'btn secondary', onclick: ()=>{ (d.variations||(d.variations=[])).push({ name:'New Variation', hint:'' }); render(); } }, 'Add Variation'));

    content.appendChild(el('div', { class:'row end gap' },
      el('button', { class:'btn secondary', onclick: close }, 'Close'),
      el('button', { class:'btn', onclick: async ()=>{
        if (!isValidName(d.name)) { showToast('Please enter a valid name.'); return; }
        await updatePrompt(d.id, { name: normalizeName(d.name), provider:d.provider, model:d.model, type:d.type, content:d.content, variations:d.variations });
        close();
      } }, 'Save')
    ));
  };
  render();
}

function confirmDelete(it){
  const { close, content } = openModal({ title:'Delete AI Element?', body: el('div',{}) });
  content.appendChild(el('p', {}, `Delete "${it.name}"? This cannot be undone.`));
  content.appendChild(el('div', { class:'row end gap' },
    el('button', { class:'btn secondary', onclick: close }, 'Cancel'),
    el('button', { class:'btn danger', onclick: async ()=>{ await deletePrompt(it.id); close(); } }, 'Delete')
  ));
}

function groupedLibrary(){
  const groups = groupPromptsByAI(getAll());
  const container = el('div', { class:'stack gap' });
  Object.keys(groups).forEach(provider => {
    const models = groups[provider];
    const provSection = el('div', { class:'card' }, el('h3', {}, provider));
    Object.keys(models).forEach(model => {
      const items = models[model] || [];
      const row = el('div', { class:'stack' }, el('h4', {}, model));
      const list = el('div', { class:'grid cols-2 list' }, ...applyFilter(items).map(card));
      row.appendChild(list);
      provSection.appendChild(row);
    });
    container.appendChild(provSection);
  });
  return container;
}

/* ------------------------------------------------------------
   Render
------------------------------------------------------------ */
export function render(){
  const main = el('div', {});
  main.appendChild(toolbar());
  main.appendChild(groupedLibrary());
  return main;
}
