// ui/modules/prompts.js
import { el, rpc, getState, setState, Toolbar, applyFilter, showToast, openModal, closeModal } from '../utils.js';

export const id = 'prompts';
export const label = 'Prompts';

function toolbar(){ return Toolbar({ buttons: [] }); }
async function addPrompt(item){ const { id } = await rpc('ADD_PROMPT', { item }); const pr = await rpc('LIST_PROMPTS'); setState({ prompts: pr.items }); showToast('Saved'); return id; }

function variablePicker(onPick){
  return el('select', { onchange:(e)=>{ const v = e.target.value; if (v) onPick(v); e.target.selectedIndex = 0; } },
    el('option', { value:'' }, 'Insert variable...'),
    ...(getState().data.variables || []).map(v => el('option', { value:`{{${v.name}}}` }, `{{${v.name}}}`))
  );
}

/* Wizard state */
let wiz = {
  step: 1,
  persona: 'Market Analyst',
  templateId: 'forecast_prompt',
  values: {},
  open: true
};

const PERSONAS = [
  { id:'Market Analyst', system:'You are a market analyst specializing in short term trading.' },
  { id:'Technical Writer', system:'You write precise technical documentation for developers.' },
  { id:'Customer Support', system:'You are a calm, helpful support agent focused on resolving issues quickly.' }
];

// Persona defaults editor - local module state
let personaDefaults = {
  'Market Analyst': 'You are a market analyst specializing in short term trading.',
  'Technical Writer': 'You write precise technical documentation for developers.',
  'Customer Support': 'You are a calm, helpful support agent focused on resolving issues quickly.'
};

function Stepper(){
  const steps = [
    { n:1, label:'Persona' },
    { n:2, label:'Template' },
    { n:3, label:'Fields' },
    { n:4, label:'Review' }
  ];
  return el('div', { class:'stepper' },
    ...steps.map(s => el('div', { class:'step' + (wiz.step === s.n ? ' active' : '') }, `${s.n}. ${s.label}`))
  );
}

function openPersonaModal(){
  const body = el('div', {});
  body.appendChild(el('label', {}, 'System prompt for persona'));
  const ta = el('textarea', { class:'input big' }, personaDefaults[wiz.persona] || '');
  ta.oninput = (e)=>{ personaDefaults[wiz.persona] = e.target.value; };
  openModal({
    title: `Persona Defaults - ${wiz.persona}`,
    body,
    actions: [
      el('button', { class:'btn secondary', onclick: closeModal }, 'Close'),
      el('button', { class:'btn', onclick: ()=>{ closeModal(); } }, 'Save')
    ]
  });
}

function personaStep(){
  return el('div', {},
    el('label', {}, 'Choose persona'),
    el('div', { class:'row' },
      el('select', { class:'input', onchange:(e)=>{ wiz.persona = e.target.value; } },
        ...PERSONAS.map(p => el('option', { value:p.id, selected: wiz.persona===p.id }, p.id))
      ),
      el('button', { class:'btn secondary', onclick: openPersonaModal }, 'Edit defaults')
    ),
    el('div', { class:'row' }, el('button', { class:'btn', onclick: ()=>{ wiz.step = 2; setState({}); } }, 'Next'))
  );
}

function templateStep(tplMap){
  return el('div', {},
    el('label', {}, 'Template'),
    el('select', { class:'input', onchange:(e)=>{ wiz.templateId = e.target.value; } },
      ...Object.entries(tplMap).map(([k,v]) => el('option', { value:k, selected: wiz.templateId===k }, v.label || k))
    ),
    el('div', { class:'row' }, el('button', { class:'btn', onclick: ()=>{ wiz.step = 3; setState({}); } }, 'Next'))
  );
}

// Repaired and modal-friendly fieldsStep
function fieldsStep(tpl) {
  const container = el('div', { class: 'grid cols-3' });
  if (!wiz) wiz = {};
  if (!wiz.values) wiz.values = {};

  function openFieldModal(name, def) {
    const body = el('div', {});
    const setVal = function (val) { wiz.values[name] = val; };

    if (def.type === 'enum') {
      body.appendChild(el('label', {}, def.label || name));
      body.appendChild(el('select', {
        class: 'input',
        onchange: function (e) { setVal(e.target.value); }
      },
        ...def.values.map(function (v) {
          return el('option', {
            value: v,
            selected: ((wiz.values[name] ?? def.default) === v)
          }, v);
        })
      ));

    } else if (def.type === 'list') {
      body.appendChild(el('label', {}, def.label || name));
      body.appendChild(el('select', {
        multiple: true,
        class: 'input',
        onchange: function (e) {
          setVal(Array.from(e.target.selectedOptions).map(function (o) {
            return o.value;
          }));
        }
      },
        ...def.values.map(function (v) {
          return el('option', {
            value: v,
            selected: (((wiz.values[name] ?? def.default) || []).includes(v))
          }, v);
        })
      ));

    } else {
      body.appendChild(el('label', {}, def.label || name));
      const input = el('textarea', {
        class: 'input big',
        value: ((wiz.values[name] ?? def.default) || '')
      });
      input.oninput = function (e) { setVal(e.target.value); };
      body.appendChild(input);
      body.appendChild(el('div', { class: 'row' },
        variablePicker(function (val) {
          input.value = val;
          setVal(val);
        })
      ));
    }

    openModal({
      title: `Edit - ${def.label || name}`,
      body: body,
      actions: [
        el('button', { class: 'btn secondary', onclick: closeModal }, 'Cancel'),
        el('button', {
          class: 'btn',
          onclick: function () { closeModal(); setState({}); }
        }, 'Apply')
      ]
    });
  }

  function fieldRow(name, def) {
    const label = def.label || name;
    const button = el('button', { class:'btn secondary', onclick: ()=> openFieldModal(name, def) }, 'Open editor');
    container.appendChild(el('div', { class: 'card' }, el('label', {}, label), button));
  }

  for (const [name, def] of Object.entries(tpl.dynamic_fields)) {
    fieldRow(name, def);
  }

  return el('div', {},
    container,
    el('div', { class: 'row' },
      el('button', {
        class: 'btn',
        onclick: function () { wiz.step = 4; setState({}); }
      }, 'Next')
    )
  );
}

function renderTemplateText(tpl){
  let text = tpl.user;
  for (const [k,v] of Object.entries(wiz.values || {})){
    const val = Array.isArray(v) ? v.join(', ') : v;
    text = text.replaceAll('{'+k+'}', String(val));
  }
  const sys = personaDefaults[wiz.persona] || '';
  return `SYSTEM:\n${sys}\n\nUSER:\n${text}`;
}

async function savePrompt(tplMap){
  const tpl = tplMap[wiz.templateId];
  const rendered = renderTemplateText(tpl);
  const persona = PERSONAS.find(p => p.id === wiz.persona);
  await addPrompt({ name: `${wiz.persona} ${new Date().toLocaleString()}`, templateId: wiz.templateId, values: wiz.values, rendered, persona: wiz.persona, system: persona?.system || '' });
}

function reviewStep(tplMap){
  const tpl = tplMap[wiz.templateId];
  const rendered = renderTemplateText(tpl);
  return el('div', {},
    el('label', {}, 'Rendered prompt'),
    el('textarea', { class:'input big', readonly:true }, rendered),
    el('div', { class:'row' },
      el('button', { class:'btn secondary', onclick: async ()=>{ await navigator.clipboard.writeText(rendered); showToast('Copied'); } }, 'Copy'),
      el('button', { class:'btn', onclick: ()=> savePrompt(tplMap) }, 'Save')
    )
  );
}

function wizardView(){
  const box = el('div', { class:'card' });
  box.appendChild(el('h3', {}, 'Prompt Wizard'));
  box.appendChild(Stepper());

  const state = getState();
  const tplMap = (state.promptData && state.promptData.templates) || null;
  if (!tplMap) {
    box.appendChild(el('div', { class:'small' }, 'Loading templates...'));
    return box;
  }
  box.appendChild(
    wiz.step === 1 ? personaStep()
    : wiz.step === 2 ? templateStep(tplMap)
    : wiz.step === 3 ? fieldsStep(tplMap[wiz.templateId])
    : reviewStep(tplMap)
  );
  return box;
}

/* Library - sample prompts using persona defaults */
const SAMPLE_PROMPTS = [
  { name:'Analyst quick take', persona:'Market Analyst', templateId:'forecast_prompt', values:{ ticker:'AAPL', price_range:'160 to 190', float_size:'high' } },
  { name:'Tech writer outline', persona:'Technical Writer', templateId:'forecast_prompt', values:{ ticker:'SDK', price_range:'n/a', trade_type:'day' } }
];

function library(){
  const wrap = el('div', { class:'card' }, el('h3', {}, 'Library'));
  const grid = el('div', { class:'grid cols-3' },
    ...SAMPLE_PROMPTS.map(p => el('div', { class:'card' },
      el('strong', {}, p.name),
      el('div', { class:'small' }, `Persona: ${p.persona}`),
      el('div', { class:'row' },
        el('button', { class:'btn secondary', onclick: ()=>{ wiz.open = true; wiz.step = 4; wiz.persona = p.persona; wiz.templateId = p.templateId; wiz.values = { ...(p.values||{}) }; setState({}); } }, 'Load to review')
      )
    ))
  );
  wrap.appendChild(grid);
  return wrap;
}

/* Library of saved prompts remains below */
function librarySaved(){
  const items = applyFilter(getState().prompts || []);
  return el('div', { class:'grid cols-2 list' }, ...items.map(p => el('div', { class:'card' },
    el('div', { class:'row between' },
      el('strong', {}, p.name),
      el('div', {},
        el('button', { class:'btn secondary', onclick: async ()=>{ await navigator.clipboard.writeText(p.rendered||''); showToast('Copied'); } }, 'Copy'),
        el('button', { class:'btn secondary', onclick: async ()=>{ await rpc('DELETE_PROMPT', { id: p.id }); const pr = await rpc('LIST_PROMPTS'); setState({ prompts: pr.items }); showToast('Deleted'); } }, 'Delete')
      )
    ),
    el('textarea', {}, p.rendered||'')
  )));
}

export function render(){
  const wrap = el('div', {});
  wrap.appendChild(el('div', { class:'card' }, el('h3', {}, 'Prompts')));
  wrap.appendChild(toolbar());
  wrap.appendChild(wizardView());
  wrap.appendChild(el('hr', { class:'divider' }));
  wrap.appendChild(library());
  wrap.appendChild(el('hr', { class:'divider' }));
  wrap.appendChild(librarySaved());
  return wrap;
}
