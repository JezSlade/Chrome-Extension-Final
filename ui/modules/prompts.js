// ui/modules/prompts.js
import { el, rpc, getState, setState, Toolbar, applyFilter, showToast } from '../utils.js';

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

function personaStep(){
  return el('div', {},
    el('label', {}, 'Choose persona'),
    el('select', { class:'input', onchange:(e)=>{ wiz.persona = e.target.value; } },
      ...PERSONAS.map(p => el('option', { value:p.id, selected: wiz.persona===p.id }, p.id))
    ),
    el('div', { class:'row' }, el('button', { class:'btn', onclick: ()=>{ wiz.step = 2; setState({}); } }, 'Next'))
  );
}

function templateStep(tplMap){
  // For now use the existing single template
  return el('div', {},
    el('label', {}, 'Template'),
    el('select', { class:'input', onchange:(e)=>{ wiz.templateId = e.target.value; } },
      ...Object.entries(tplMap).map(([k,v]) => el('option', { value:k, selected: wiz.templateId===k }, v.label || k))
    ),
    el('div', { class:'row' }, el('button', { class:'btn', onclick: ()=>{ wiz.step = 3; setState({}); } }, 'Next'))
  );
}

function fieldsStep(tpl) {
  const container = el('div', { class: 'grid cols-3' });
  if (!wiz) wiz = {};
  if (!wiz.values) wiz.values = {};

  function fieldRow(name, def) {
    const label = def.label || name;
    let control;
    let setVal = function (val) { wiz.values[name] = val; };

    if (def.type === 'enum') {
      control = el('div', { class: 'row' },
        el('select', {
          onchange: function (e) {
            setVal(e.target.value);
          }
        }, ...def.values.map(function (v) {
          return el('option', {
            value: v,
            selected: (wiz.values[name] || def.default) === v
          }, v);
        })),
        variablePicker(function (val) { setVal(val); })
      );
      setVal(wiz.values[name] || def.default || def.values[0]);

    } else if (def.type === 'list') {
      const sel = el('select', {
        multiple: true,
        onchange: function (e) {
          setVal(Array.from(e.target.selectedOptions).map(function (o) {
            return o.value;
          }));
        }
      }, ...def.values.map(function (v) {
        return el('option', {
          value: v,
          selected: (wiz.values[name] || def.default || []).includes(v)
        }, v);
      }));
      control = el('div', { class: 'row' },
        sel,
        variablePicker(function (val) { setVal([val]); })
      );
      setVal(wiz.values[name] || def.default || []);

    } else {
      const input = el('input', {
        class: 'input',
        value: wiz.values[name] || def.default || '',
        oninput: function (e) { setVal(e.target.value); }
      });
      const vars = variablePicker(function (val) {
        input.value = val;
        setVal(val);
      });
      control = el('div', { class: 'row' }, input, vars);
      setVal(wiz.values[name] || def.default || '');
    }

    container.appendChild(el('div', { class: 'card' },
      el('label', {}, label),
      control
    ));
  }

  for (const [name, def] of Object.entries(tpl.dynamic_fields)) {
    fieldRow(name, def);
  }

  return el('div', {},
    container,
    el('div', { class: 'row' },
      el('button', {
        class: 'btn',
        onclick: function () {
          wiz.step = 4;
          setState({});
        }
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
  return text;
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
    el('textarea', { class:'input', readonly:true }, rendered),
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
  const wrap = el('div', {});
  rpc('GET_PROMPT_DATA').then(res => {
    const tplMap = res.data.templates || {};
    // render current step content
    wrap.innerHTML = '';
    wrap.appendChild(
      wiz.step === 1 ? personaStep()
      : wiz.step === 2 ? templateStep(tplMap)
      : wiz.step === 3 ? fieldsStep(tplMap[wiz.templateId])
      : reviewStep(tplMap)
    );
  });
  box.appendChild(wrap);
  return box;
}

/* Library */

function library(){
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
  return wrap;
}
