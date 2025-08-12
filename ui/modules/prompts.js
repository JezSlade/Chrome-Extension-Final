// ui/modules/prompts.js
import { el, rpc, getState, setState, Toolbar, applyFilter, showToast, openModal, closeModal, withSidebar, MarkdownEditor, triggerAutoSyncPush, WizardStepper } from '../utils.js';

export const id = 'prompts';
export const label = 'Prompts';

function toolbar(){ return Toolbar({ buttons: [] }); }
async function addPrompt(item){
  const { id } = await rpc('ADD_PROMPT', { item });
  const pr = await rpc('LIST_PROMPTS');
  setState({ prompts: pr.items });
  triggerAutoSyncPush();
  showToast('Saved');
  return id;
}

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
  tplOverrides: { user: null },
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
  return WizardStepper(steps, wiz.step);
}

function openPersonaModal(){
  const body = el('div', {});
  body.appendChild(el('label', {}, 'System prompt for persona'));
  body.appendChild(MarkdownEditor({ value: personaDefaults[wiz.persona] || '', oninput:(v)=>{ personaDefaults[wiz.persona] = v; } }));
  openModal({
    title: `Persona Defaults - ${wiz.persona}`,
    body,
    actions: [
      el('button', { class:'btn secondary', onclick: closeModal }, 'Close'),
      el('button', { class:'btn', onclick: ()=>{ closeModal(); } }, 'Save')
    ]
  });
}

function openTemplateEditModal(tpl){
  const body = el('div', {});
  const currentUser = wiz.tplOverrides.user != null ? wiz.tplOverrides.user : tpl.user;
  body.appendChild(el('label', {}, 'Template text (USER)'));
  body.appendChild(MarkdownEditor({ value: currentUser || '', oninput:(v)=>{ wiz.tplOverrides.user = v; } }));
  openModal({
    title: 'Edit Template Copy',
    body,
    actions: [
      el('button', { class:'btn secondary', onclick: ()=>{ wiz.tplOverrides.user = null; closeModal(); setState({}); } }, 'Reset'),
      el('button', { class:'btn', onclick: ()=>{ closeModal(); setState({}); } }, 'Apply')
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
  const tpl = tplMap[wiz.templateId];
  return el('div', {},
    el('label', {}, 'Template'),
    el('select', { class:'input', onchange:(e)=>{ wiz.templateId = e.target.value; wiz.tplOverrides.user = null; } },
      ...Object.entries(tplMap).map(([k,v]) => el('option', { value:k, selected: wiz.templateId===k }, v.label || k))
    ),
    el('div', { class:'row' },
      el('button', { class:'btn secondary', onclick: ()=> openTemplateEditModal(tpl) }, 'Edit template text'),
      el('button', { class:'btn', onclick: ()=>{ wiz.step = 3; setState({}); } }, 'Next')
    )
  );
}

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
          setVal(Array.from(e.target.selectedOptions).map(function (o) { return o.value; }));
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
      body.appendChild(MarkdownEditor({ value: ((wiz.values[name] ?? def.default) || ''), oninput:(v)=> setVal(v) }));
      body.appendChild(el('div', { class: 'row' }, variablePicker(function (val) { setVal(val); })));
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
      el('button', { class: 'btn', onclick: function () { wiz.step = 4; setState({}); } }, 'Next')
    )
  );
}

function renderTemplateText(tpl){
  const userText = wiz.tplOverrides.user != null ? wiz.tplOverrides.user : tpl.user;
  let text = userText;
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

/* Sidebar: templates and saved */
function templatesSidebar(){
  const state = getState();
  const tplMap = (state.promptData && state.promptData.templates) || {};
  const wrap = el('div', { class:'card' }, el('h3', {}, 'Templates'));
  const keys = Object.keys(tplMap);
  if (!keys.length){ wrap.appendChild(el('div', { class:'small' }, 'No templates found.')); return wrap; }
  keys.forEach(k=>{
    const v = tplMap[k];
    wrap.appendChild(el('div', { class:'row' },
      el('button', { class:'btn secondary', onclick: ()=>{ wiz.templateId = k; wiz.step = 3; wiz.tplOverrides.user = null; setState({}); } }, v.label || k)
    ));
  });
  return wrap;
}
function savedSidebar(){
  const items = applyFilter(getState().prompts || []);
  const wrap = el('div', { class:'card' }, el('h3', {}, 'Saved'));
  if (!items.length){ wrap.appendChild(el('div', { class:'small' }, 'No saved prompts.')); return wrap; }
  items.forEach(p=>{
    wrap.appendChild(el('div', { class:'row' },
      el('button', { class:'btn secondary', onclick: ()=>{ wiz.open = true; wiz.step = 4; wiz.persona = p.persona || 'Market Analyst'; wiz.templateId = p.templateId; wiz.values = { ...(p.values||{}) }; setState({}); } }, p.name)
    ));
  });
  return wrap;
}

export function render(){
  const main = el('div', {});
  main.appendChild(el('div', { class:'card' }, el('h3', {}, 'Prompts')));
  main.appendChild(toolbar());
  main.appendChild(wizardView());
  const sidebar = el('div', {}, templatesSidebar(), el('div', { class:'divider' }), savedSidebar());
  return withSidebar(sidebar, main);
}
