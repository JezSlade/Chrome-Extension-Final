// Ui/modules/prompts.js
// AI Element Library — grouped per AI provider/model with CRUD and element types.

import * as U from '../utils.js';

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
  return U.Toolbar({
    title: 'AI Element Library',
    buttons: [ U.el('button', { class:'btn', onclick: ()=> openNewPromptWizard() }, 'New AI Element') ]
  });
}

function getAll(){ return (U.getState().prompts || []); }
async function reload(){
  const pr = await U.rpc('GET_ELEMENTS', { payload: { type: 'prompts' } });
  U.setState({ prompts: pr.items });
}

async function addPrompt(item){
  await U.rpc('CREATE_ELEMENT', { payload: { type: 'prompts', data: item } });
  await reload();
  U.triggerAutoSyncPush();
  U.showToast('AI element added');
}
async function updatePrompt(id, patch){
  await U.rpc('UPDATE_ELEMENT', { payload: { type: 'prompts', id, data: patch } });
  await reload();
  U.triggerAutoSyncPush();
}
async function deletePrompt(id){
  await U.rpc('DELETE_ELEMENT', { payload: { type: 'prompts', id } });
  await reload();
  U.triggerAutoSyncPush();
}

/* ------------------------------------------------------------
   Wizard (new element)
------------------------------------------------------------ */
let wiz = { open:false, step:1, draft:{ name:'', provider:'OpenAI', model:'gpt-4o', type:'Instruction', content:'', variations:[] } };

function openNewPromptWizard(){
  wiz = { open:true, step:1, draft:{ name:'', provider:'OpenAI', model:'gpt-4o', type:'Instruction', content:'', variations:[] } };
  const { close, content } = U.openModal({ title:'New AI Element', body: U.el('div',{}) });
  const render = ()=>{
    content.innerHTML = '';
    content.appendChild(U.WizardStepper({ steps:['Basics','Body','Variations'], current: wiz.step }));

    if (wiz.step === 1){
      const d = wiz.draft;
      content.appendChild(U.el('label', {}, 'Human‑readable name'));
      content.appendChild(U.el('input', { class:'input', placeholder:'e.g., Beginner‑friendly explainer', value:d.name, oninput:(e)=> d.name = e.target.value }));

      content.appendChild(U.el('div', { class:'grid cols-2 gap' },
        U.el('div', {},
          U.el('label', {}, 'Element Type'),
          U.el('select', { class:'input', onchange:(e)=> d.type = e.target.value }, ...ELEMENT_TYPES.map(t => U.el('option', { value:t, selected:d.type===t }, t)))
        ),
        U.el('div', {},
          U.el('label', {}, 'Provider • Model'),
          U.el('div', { class:'row gap' },
            U.el('input', { class:'input', placeholder:'Provider (e.g., OpenAI, Anthropic)', value:d.provider, oninput:(e)=> d.provider=e.target.value }),
            U.el('input', { class:'input', placeholder:'Model (e.g., gpt‑4o, claude‑3.5)', value:d.model, oninput:(e)=> d.model=e.target.value })
          )
        )
      ));

      content.appendChild(U.el('div', { class:'row end' }, U.el('button', { class:'btn', onclick: ()=>{
        if (!U.isValidName(d.name)) { U.showToast('Please enter a valid name.'); return; }
        const existing = getAll().map(x => x.name).filter(Boolean);
        d.name = U.ensureUniqueName(U.normalizeName(d.name), existing);
        wiz.step = 2; render();
      } }, 'Next')));
    }
    else if (wiz.step === 2){
      const d = wiz.draft;
      content.appendChild(U.el('label', {}, `${d.type} — Content`));
      content.appendChild(U.MarkdownEditor({ value:d.content, oninput:(v)=> d.content = v }));
      content.appendChild(U.el('div', { class:'row between' },
        U.el('button', { class:'btn secondary', onclick: ()=>{ wiz.step=1; render(); } }, 'Back'),
        U.el('button', { class:'btn', onclick: ()=>{ wiz.step=3; render(); } }, 'Next')
      ));
    }
    else if (wiz.step === 3){
      const d = wiz.draft;
      content.appendChild(U.el('div', { class:'small' }, 'Add optional variations; each is a small tweak selectable during insertion.'));
      const list = U.el('div', { class:'stack gap' });
      (d.variations||[]).forEach((v, idx)=>{
        const row = U.el('div', { class:'row gap' },
          U.el('input', { class:'input', placeholder:'Variation name', value:v.name||'', oninput:(e)=> v.name = e.target.value }),
          U.el('input', { class:'input', placeholder:'Short hint / modifier', value:v.hint||'', oninput:(e)=> v.hint = e.target.value }),
          U.el('button', { class:'btn danger', onclick: ()=>{ d.variations.splice(idx,1); render(); } }, 'Remove')
        );
        list.appendChild(row);
      });
      content.appendChild(list);
      content.appendChild(U.el('button', { class:'btn secondary', onclick: ()=>{ (d.variations||(d.variations=[])).push({ name:'New Variation', hint:'' }); render(); } }, 'Add Variation'));

      content.appendChild(U.el('div', { class:'row between' },
        U.el('button', { class:'btn secondary', onclick: ()=>{ wiz.step=2; render(); } }, 'Back'),
        U.el('button', { class:'btn', onclick: async ()=>{ await addPrompt(wiz.draft); close(); } }, 'Create')
      ));
    }
  };
  render();
}

function card(it){
  const meta = U.el('div', { class:'small' }, `${it.type || 'Instruction'} • ${it.provider || 'default'}${it.model ? ' / ' + it.model : ''}`);
  const body = U.el('div', { class:'muted' }, (it.content && it.content.slice(0, 240)) || '—');
  return U.el('div', { class:'card' },
    U.el('h4', {}, it.name || 'Untitled'),
    meta,
    body,
    U.el('div', { class:'row end gap' },
      U.el('button', { class:'btn secondary', onclick: ()=> edit(it) }, 'Edit'),
      U.el('button', { class:'btn danger', onclick: ()=> confirmDelete(it) }, 'Delete')
    )
  );
}

function edit(it){
  const d = Object.assign({}, it);
  const { close, content } = U.openModal({ title:`Edit • ${d.name||'AI Element'}`, body: U.el('div',{}) });
  const render = ()=>{
    content.innerHTML = '';
    content.appendChild(U.el('label', {}, 'Name'));
    content.appendChild(U.el('input', { class:'input', value:d.name||'', oninput:(e)=> d.name = e.target.value }));

    content.appendChild(U.el('div', { class:'grid cols-2 gap' },
      U.el('div', {},
        U.el('label', {}, 'Element Type'),
        U.el('select', { class:'input', onchange:(e)=> d.type = e.target.value }, ...ELEMENT_TYPES.map(t => U.el('option', { value:t, selected:d.type===t }, t)))
      ),
      U.el('div', {},
        U.el('label', {}, 'Provider • Model'),
        U.el('div', { class:'row gap' },
          U.el('input', { class:'input', value:d.provider||'', oninput:(e)=> d.provider=e.target.value }),
          U.el('input', { class:'input', value:d.model||'', oninput:(e)=> d.model=e.target.value })
        )
      )
    ));

    content.appendChild(U.el('label', {}, `${d.type || 'Instruction'} — Content`));
    content.appendChild(U.MarkdownEditor({ value:d.content||'', oninput:(v)=> d.content = v }));

    const list = U.el('div', { class:'stack gap' });
    (d.variations||[]).forEach((v, idx)=>{
      const row = U.el('div', { class:'row gap' },
        U.el('input', { class:'input', placeholder:'Variation name', value:v.name||'', oninput:(e)=> v.name = e.target.value }),
        U.el('input', { class:'input', placeholder:'Short hint / modifier', value:v.hint||'', oninput:(e)=> v.hint = e.target.value }),
        U.el('button', { class:'btn danger', onclick: ()=>{ d.variations.splice(idx,1); render(); } }, 'Remove')
      );
      list.appendChild(row);
    });
    content.appendChild(list);
    content.appendChild(U.el('button', { class:'btn secondary', onclick: ()=>{ (d.variations||(d.variations=[])).push({ name:'New Variation', hint:'' }); render(); } }, 'Add Variation'));

    content.appendChild(U.el('div', { class:'row end gap' },
      U.el('button', { class:'btn secondary', onclick: close }, 'Close'),
      U.el('button', { class:'btn', onclick: async ()=>{
        if (!U.isValidName(d.name)) { U.showToast('Please enter a valid name.'); return; }
        await updatePrompt(d.id, { name: U.normalizeName(d.name), provider:d.provider, model:d.model, type:d.type, content:d.content, variations:d.variations });
        close();
      } }, 'Save')
    ));
  };
  render();
}

function confirmDelete(it){
  const { close, content } = U.openModal({ title:'Delete AI Element?', body: U.el('div',{}) });
  content.appendChild(U.el('p', {}, `Delete "${it.name}"? This cannot be undone.`));
  content.appendChild(U.el('div', { class:'row end gap' },
    U.el('button', { class:'btn secondary', onclick: close }, 'Cancel'),
    U.el('button', { class:'btn danger', onclick: async ()=>{ await deletePrompt(it.id); close(); } }, 'Delete')
  ));
}

function groupedLibrary(){
  const groups = U.groupPromptsByAI(getAll());
  const container = U.el('div', { class:'stack gap' });
  Object.keys(groups).forEach(provider => {
    const models = groups[provider];
    const provSection = U.el('div', { class:'card' }, U.el('h3', {}, provider));
    Object.keys(models).forEach(model => {
      const items = models[model] || [];
      const row = U.el('div', { class:'stack' }, U.el('h4', {}, model));
      const list = U.el('div', { class:'grid cols-2 list' }, ...U.applyFilter(items).map(card));
      row.appendChild(list);
      provSection.appendChild(row);
    });
    container.appendChild(provSection);
  });
  return container;
}

export function render(){
  const main = U.el('div', {});
  main.appendChild(toolbar());
  main.appendChild(groupedLibrary());
  return main;
}
