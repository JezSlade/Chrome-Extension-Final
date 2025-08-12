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
function builder(){
  const box = el('div', { class:'card' });
  box.appendChild(el('h3', {}, 'Prompt Engineer'));
  const out = el('textarea', { placeholder:'Rendered prompt will appear here...' });
  const container = el('div', { class:'grid cols-3' });
  rpc('GET_PROMPT_DATA').then(res => {
    const tpl = res.data.templates.forecast_prompt;
    const values = {};
    function fieldRow(name, def){
      const label = def.label || name;
      let control;
      let setVal = (val)=>{ values[name] = val; };
      if (def.type === 'enum'){
        control = el('div', { class:'row' },
          el('select', { onchange:(e)=> setVal(e.target.value) }, ...def.values.map(v => el('option', { value:v, selected: v===def.default }, v)) ),
          variablePicker((val)=> setVal(val))
        );
        setVal(def.default || def.values[0]);
      } else if (def.type === 'list'){
        const sel = el('select', { multiple:true, onchange:(e)=> setVal(Array.from(e.target.selectedOptions).map(o=>o.value)) }, ...def.values.map(v => el('option', { value:v, selected: (def.default||[]).includes(v) }, v)) );
        control = el('div', { class:'row' }, sel, variablePicker((val)=> setVal([val]) ));
        setVal(def.default || []);
      } else {
        const input = el('input', { class:'input', value: def.default || '', oninput:(e)=> setVal(e.target.value) });
        const vars = variablePicker((val)=>{ input.value = val; setVal(val); });
        control = el('div', { class:'row' }, input, vars);
        setVal(def.default || '');
      }
      container.appendChild(el('div', { class:'card' }, el('label', {}, label), control));
    }
    for (const [name, def] of Object.entries(tpl.dynamic_fields)){ fieldRow(name, def); }
    function renderTemplate(){ let text = tpl.user; for (const [k,v] of Object.entries(values)){ const val = Array.isArray(v) ? v.join(', ') : v; text = text.replaceAll('{'+k+'}', String(val)); } out.value = text; }
    const actions = el('div', { class:'row' },
      el('button', { class:'btn', onclick: renderTemplate }, 'Render'),
      el('button', { class:'btn secondary', onclick: async ()=>{ renderTemplate(); await navigator.clipboard.writeText(out.value); showToast('Copied'); } }, 'Copy'),
      el('button', { class:'btn secondary', onclick: async ()=>{ renderTemplate(); await addPrompt({ name: 'Saved '+new Date().toLocaleString(), templateId: 'forecast_prompt', values: values, rendered: out.value }); } }, 'Save')
    );
    box.appendChild(container);
    box.appendChild(actions);
    box.appendChild(out);
  });
  return box;
}
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
  wrap.appendChild(builder());
  wrap.appendChild(el('hr'));
  wrap.appendChild(library());
  return wrap;
}
