(function(){
  // =============================
  // DOM helpers
  // =============================
  const app = document.getElementById('app');
  function el(tag, attrs = {}, ...children){
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)){
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v);
    }
    for (const c of children){ if (c == null) continue; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return e;
  }

  async function rpc(type, payload){ const res = await chrome.runtime.sendMessage({ type, ...payload }); if (!res || !res.ok) throw new Error(res && res.error || 'RPC failed'); return res; }

  // =============================
  // State
  // =============================
  let state = {
    tab: (location.hash && location.hash.slice(1)) || 'expansions',
    expansions: [],
    variables: [],
    forms: [],
    prompts: [],
    menu: null,
    filter: '',
    toast: null,
    selectedFormId: null,
    contextMenu: { open: false, x: 0, y: 0, items: [] },
  };
  function setState(p){ state = Object.assign({}, state, p); render(); }
  function showToast(t){ setState({ toast: t }); setTimeout(()=> setState({ toast: null }), 1800); }

  // =============================
  // Load
  // =============================
  async function load(){
    const st = await rpc('GET_STATE');
    const pr = await rpc('LIST_PROMPTS');
    const menu = await rpc('GET_MENU');
    setState({
      expansions: st.data.expansions||[],
      variables: st.data.variables||[],
      forms: st.data.forms||[],
      prompts: pr.items||[],
      menu: menu.menu||null
    });
  }

  // =============================
  // Helpers
  // =============================
  function applyFilter(list){ const q = state.filter.trim().toLowerCase(); if (!q) return list; return list.filter(x => JSON.stringify(x).toLowerCase().includes(q)); }
  const uid = () => Math.floor(Math.random()*1e9);

  // =============================
  // CRUD wrappers
  // =============================
  async function addExpansion(){ const { id } = await rpc('ADD_EXPANSION', { item: { trigger: ':new', replacement: 'New expansion', type: 'text' } }); await load(); showToast('Added'); }
  async function updateExpansion(id, patch){ await rpc('UPDATE_EXPANSION', { id, patch }); await load(); showToast('Saved'); }
  async function deleteExpansion(id){ await rpc('DELETE_EXPANSION', { id }); await load(); showToast('Deleted'); }

  async function addVariable(){ const { id } = await rpc('ADD_VARIABLE', { item: { name: 'newVar', type: 'formatDate', default: '%Y-%m-%d' } }); await load(); setState({ tab: 'variables' }); showToast('Added'); }
  async function updateVariable(id, patch){ await rpc('UPDATE_VARIABLE', { id, patch }); await load(); showToast('Saved'); }
  async function deleteVariable(id){ await rpc('DELETE_VARIABLE', { id }); await load(); showToast('Deleted'); }

  async function addForm(){ const { id } = await rpc('ADD_FORM', { item: { name: 'New Form', description: '', fields: [] } }); await load(); setState({ tab: 'forms', selectedFormId: id }); showToast('Added'); }
  async function updateForm(id, patch){ await rpc('UPDATE_FORM', { id, patch }); await load(); showToast('Saved'); }
  async function deleteForm(id){ await rpc('DELETE_FORM', { id }); await load(); showToast('Deleted'); }

  async function addPrompt(item){ const { id } = await rpc('ADD_PROMPT', { item }); await load(); setState({ tab: 'prompts' }); showToast('Saved'); return id; }
  async function updatePrompt(id, patch){ await rpc('UPDATE_PROMPT', { id, patch }); await load(); showToast('Saved'); }
  async function deletePrompt(id){ await rpc('DELETE_PROMPT', { id }); await load(); showToast('Deleted'); }

  async function setMenu(menu){ await rpc('SET_MENU', { menu }); await load(); showToast('Menu updated'); }

  // =============================
  // Builder interactions (DnD + context menu)
  // =============================
  const PALETTE = [
    { type: 'text', label: 'Text' },
    { type: 'textarea', label: 'Paragraph' },
    { type: 'number', label: 'Number' },
    { type: 'date', label: 'Date' },
    { type: 'select', label: 'Select' }
  ];
  function onDragStart(e, payload){ e.dataTransfer.setData('application/x-toolforge', JSON.stringify(payload)); e.dataTransfer.effectAllowed = 'copy'; }
  function onDropField(e, form){ e.preventDefault(); const d = e.dataTransfer.getData('application/x-toolforge'); if (!d) return; const p = JSON.parse(d); const f = { id: uid(), type: p.type, label: p.label + ' Field', key: 'field_'+Math.random().toString(36).slice(2,7), required: false, options: [], default: '' }; form.fields.push(f); updateForm(form.id, { fields: form.fields }); }
  function onDragOver(e){ e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  function moveField(form, fromId, toId){ if (fromId === toId) return; const iFrom = form.fields.findIndex(f=>f.id===fromId); const iTo = form.fields.findIndex(f=>f.id===toId); if (iFrom<0 || iTo<0) return; const [f] = form.fields.splice(iFrom, 1); form.fields.splice(iTo, 0, f); updateForm(form.id, { fields: form.fields }); }

  // Custom context menu
  function openContextMenu(x, y, items){ const menu = document.getElementById('contextMenu'); const list = document.getElementById('contextMenuItems'); list.innerHTML = ''; for (const it of items){ list.appendChild(el('li', { onclick: ()=>{ it.onClick(); closeContextMenu(); } }, it.label)); } menu.style.left = x+'px'; menu.style.top = y+'px'; menu.classList.remove('hidden'); setState({ contextMenu: { open:true, x, y, items } }); }
  function closeContextMenu(){ const menu = document.getElementById('contextMenu'); menu.classList.add('hidden'); setState({ contextMenu: { open:false, x:0, y:0, items:[] } }); }
  document.addEventListener('click', closeContextMenu);
  document.addEventListener('contextmenu', (e)=>{ if (!e.target.closest('.builder, .list')) return; e.preventDefault(); });

  // =============================
  // Tabs
  // =============================
  function Nav(){ const Tab = (id, label) => el('div', { class:'tab'+(state.tab===id?' active':''), onclick: ()=>{ setState({ tab:id }); location.hash = id; } }, label); return el('div', { class:'nav' }, Tab('expansions','Expansions'), Tab('variables','Variables'), Tab('forms','Forms'), Tab('prompts','Prompts'), Tab('settings','Settings'), Tab('help','Help')); }
  function Toolbar(){ return el('div', { class:'row between' }, el('input', { class:'input', placeholder:'Filter...', value: state.filter, oninput:(e)=> setState({ filter: e.target.value }) }), el('div', { class:'row' }, el('button', { class:'btn', onclick:addExpansion }, 'Add Expansion'), el('button', { class:'btn secondary', onclick:addVariable }, 'Add Variable'), el('button', { class:'btn secondary', onclick:addForm }, 'Add Form')) ); }

  // Expansions
  function ListExpansions(){ const items = applyFilter(state.expansions); return el('div', { class:'grid cols-2 list' }, ...items.map(CardExpansion)); }
  function CardExpansion(it){ const cmItems = [ { label:'Edit', onClick: ()=>{} }, { label:'Duplicate', onClick: async ()=>{ const copy = Object.assign({}, it, { id: undefined, trigger: it.trigger+'_copy' }); await rpc('ADD_EXPANSION', { item: copy }); await load(); } }, { label:'Delete', onClick: ()=> deleteExpansion(it.id) } ]; return el('div', { class:'card', oncontextmenu:(e)=> openContextMenu(e.pageX, e.pageY, cmItems) }, el('div', { class:'row between' }, el('div', { class:'row' }, el('span', { class:'badge' }, it.type||'text'), el('span', { class:'small' }, `#${it.id}`)), el('div', {}, el('button', { class:'btn secondary', onclick: ()=>{} }, 'Edit'), el('button', { class:'btn secondary', onclick: ()=> deleteExpansion(it.id) }, 'Delete'))), el('div', { class:'row' }, el('input', { class:'input', value: it.trigger, oninput:(e)=> updateExpansion(it.id, { trigger: e.target.value }) })), el('div', {}, el('textarea', { oninput:(e)=> updateExpansion(it.id, { replacement: e.target.value }) }, it.replacement||'')) ); }

  // Variables
  function ListVariables(){ const items = applyFilter(state.variables); return el('div', { class:'grid cols-2 list' }, ...items.map(CardVariable)); }
  function CardVariable(it){ const cmItems = [ { label:'Delete', onClick: ()=> deleteVariable(it.id) } ]; return el('div', { class:'card', oncontextmenu:(e)=> openContextMenu(e.pageX, e.pageY, cmItems) }, el('div', { class:'row between' }, el('div', { class:'row' }, el('span', { class:'badge' }, it.type||'text'), el('span', { class:'small' }, `#${it.id}`)), el('div', {}, el('button', { class:'btn secondary', onclick: ()=> deleteVariable(it.id) }, 'Delete'))), el('div', { class:'row' }, el('input', { class:'input', value: it.name, oninput:(e)=> updateVariable(it.id, { name: e.target.value }) }), el('select', { onchange:(e)=> updateVariable(it.id, { type: e.target.value }) }, el('option', { value:'formatDate', selected: it.type==='formatDate' }, 'formatDate'), el('option', { value:'text', selected: it.type==='text' }, 'text'))), el('div', {}, el('input', { class:'input', value: it.default||'', oninput:(e)=> updateVariable(it.id, { default: e.target.value }) })) ); }

  // Forms (DnD)
  function Forms(){ const form = state.forms.find(f=>f.id===state.selectedFormId) || state.forms[0]; return el('div', {}, FormHeader(form), form ? Builder(form) : el('div', { class:'small' }, 'No forms yet. Create one to get started.')); }
  function FormHeader(form){ return el('div', { class:'row between card' }, el('div', { class:'row' }, el('label', {}, 'Form Name'), el('input', { class:'input', value: form? form.name: '', oninput:(e)=> form && updateForm(form.id, { name: e.target.value }) })), el('div', { class:'row' }, el('label', {}, 'Select'), el('select', { onchange:(e)=> setState({ selectedFormId: Number(e.target.value)||null }) }, ...state.forms.map(f => el('option', { value: f.id, selected: form && f.id===form.id }, `#${f.id} ${f.name}`))), el('button', { class:'btn secondary', onclick: ()=> addForm() }, 'New Form'), el('button', { class:'btn secondary', onclick: ()=> form && deleteForm(form.id) }, 'Delete')) ); }
  function Builder(form){ const palette = el('div', { class:'card palette' }, el('div', { class:'small' }, 'Palette'), ...PALETTE.map(p => el('div', { class:'item', draggable:true, ondragstart:(e)=> onDragStart(e,p) }, p.label)) ); const canvas = el('div', { class:'card canvas', ondragover:onDragOver, ondrop:(e)=> onDropField(e, form) }, ...(form.fields.length? form.fields.map(FieldCard.bind(null, form)) : [el('div', { class:'small' }, 'Drag items here')]) ); return el('div', { class:'builder grid' }, palette, canvas); }
  function FieldCard(form, field){ function onDragStartHandle(e){ e.dataTransfer.setData('text/x-from-id', String(field.id)); e.dataTransfer.effectAllowed = 'move'; } function onDropSwap(e){ e.preventDefault(); const from = Number(e.dataTransfer.getData('text/x-from-id')); if (from) moveField(form, from, field.id); } function onDragOverSwap(e){ e.preventDefault(); e.currentTarget.classList.add('drag-over'); } function onDragLeaveSwap(e){ e.currentTarget.classList.remove('drag-over'); } const cmItems = buildFieldContextItems(form, field); return el('div', { class:'field', draggable:true, ondragstart:onDragStartHandle, ondragover:onDragOverSwap, ondragleave:onDragLeaveSwap, ondrop:onDropSwap, oncontextmenu:(e)=> openContextMenu(e.pageX, e.pageY, cmItems) }, el('div', {}, el('div', { class:'row between' }, el('div', { class:'row' }, el('span', { class:'badge' }, field.type), el('span', { class:'small' }, field.key)), el('div', { class:'handle' }, 'Drag')), el('div', { class:'meta' }, el('input', { class:'input', placeholder:'Label', value: field.label||'', oninput:(e)=>{ field.label = e.target.value; updateForm(form.id, { fields: form.fields }); } }), el('input', { class:'input', placeholder:'Key', value: field.key||'', oninput:(e)=>{ field.key = e.target.value; updateForm(form.id, { fields: form.fields }); } }), el('select', { onchange:(e)=>{ field.type = e.target.value; updateForm(form.id, { fields: form.fields }); } }, el('option', { value:'text', selected: field.type==='text' }, 'text'), el('option', { value:'textarea', selected: field.type==='textarea' }, 'textarea'), el('option', { value:'number', selected: field.type==='number' }, 'number'), el('option', { value:'date', selected: field.type==='date' }, 'date'), el('option', { value:'select', selected: field.type==='select' }, 'select')), el('label', {}, el('input', { type:'checkbox', checked: !!field.required, onchange:(e)=>{ field.required = !!e.target.checked; updateForm(form.id, { fields: form.fields }); } }), ' Required') ), field.type==='select' ? SelectEditor(form, field) : InputPreview(field) ), el('div', {}, el('button', { class:'btn secondary', onclick: ()=> duplicateField(form, field) }, 'Duplicate'), el('button', { class:'btn secondary', onclick: ()=> removeField(form, field) }, 'Delete')) ); }
  function InputPreview(field){ if (field.type==='textarea') return el('textarea', { placeholder:'Preview...' }, field.default||''); if (field.type==='number') return el('input', { class:'input', type:'number', placeholder:'Preview...', value: field.default||'' }); if (field.type==='date') return el('input', { class:'input', type:'date', placeholder:'Preview...', value: field.default||'' }); if (field.type==='select') return el('select', {}, ...(field.options||[]).map(opt => el('option', {}, opt)) ); return el('input', { class:'input', placeholder:'Preview...', value: field.default||'' }); }
  function SelectEditor(form, field){ const wrap = el('div', {}); wrap.appendChild(el('div', { class:'small' }, 'Options (comma separated)')); wrap.appendChild(el('input', { class:'input', value:(field.options||[]).join(', '), oninput:(e)=>{ field.options = e.target.value.split(',').map(s=>s.trim()).filter(Boolean); updateForm(form.id, { fields: form.fields }); } })); return wrap; }
  function duplicateField(form, field){ const copy = Object.assign({}, field, { id: uid(), key: field.key+'_copy' }); form.fields.push(copy); updateForm(form.id, { fields: form.fields }); }
  function removeField(form, field){ form.fields = form.fields.filter(f=>f.id!==field.id); updateForm(form.id, { fields: form.fields }); }
  function buildFieldContextItems(form, field){ const items = []; if (!state.menu || state.menu.items == null || state.menu.items.fieldEdit !== false){ items.push({ label:'Edit', onClick: ()=>{} }); } if (!state.menu || state.menu.items == null || state.menu.items.fieldDuplicate !== false){ items.push({ label:'Duplicate', onClick: ()=> duplicateField(form, field) }); } if (!state.menu || state.menu.items == null || state.menu.items.fieldDelete !== false){ items.push({ label:'Delete', onClick: ()=> removeField(form, field) }); } return items; }

  // Prompts
  async function getPromptData(){ const res = await rpc('GET_PROMPT_DATA'); return res.data; }
  function Prompts(){ return el('div', {}, PromptBuilder(), hr(), PromptLibrary()); }
  function hr(){ return el('hr'); }
  function PromptBuilder(){
    const box = el('div', { class:'card' });
    box.appendChild(el('h3', {}, 'Prompt Engineer'));
    const out = el('textarea', { placeholder:'Rendered prompt will appear here...' });

    getPromptData().then(data => {
      const tpl = data.templates.forecast_prompt;
      const form = el('div', { class:'grid cols-3' });
      const values = {};

      function variablePicker(onPick){
        const sel = el('select', { onchange:(e)=>{ const v = e.target.value; if (v) onPick(v); e.target.selectedIndex = 0; } },
          el('option', { value:'' }, 'Insert variable...'),
          ...state.variables.map(v => el('option', { value:`{{${v.name}}}` }, `{{${v.name}}}`))
        );
        return sel;
      }

      function fieldRow(name, def){
        const label = def.label || name;
        let control;
        if (def.type === 'enum'){
          control = el('select', { onchange:(e)=> values[name] = e.target.value }, ...def.values.map(v => el('option', { value:v, selected: v===def.default }, v)) );
          values[name] = def.default || def.values[0];
        } else if (def.type === 'list'){
          control = el('select', { multiple:true, onchange:(e)=> values[name] = Array.from(e.target.selectedOptions).map(o=>o.value) }, ...def.values.map(v => el('option', { value:v, selected: (def.default||[]).includes(v) }, v)) );
          values[name] = def.default || [];
        } else {
          const input = el('input', { class:'input', value: def.default || '', oninput:(e)=> values[name] = e.target.value });
          const vars = variablePicker((val)=>{ input.value = val; values[name] = val; });
          control = el('div', { class:'row' }, input, vars);
          values[name] = def.default || '';
        }
        form.appendChild(el('div', { class:'card' }, el('label', {}, label), control));
      }

      for (const [name, def] of Object.entries(tpl.dynamic_fields)){ fieldRow(name, def); }

      function renderTemplate(){ let text = tpl.user; for (const [k,v] of Object.entries(values)){ const val = Array.isArray(v) ? v.join(', ') : v; text = text.replaceAll('{'+k+'}', String(val)); } out.value = text; }

      const actions = el('div', { class:'row' },
        el('button', { class:'btn', onclick: renderTemplate }, 'Render'),
        el('button', { class:'btn secondary', onclick: async ()=>{ renderTemplate(); await navigator.clipboard.writeText(out.value); showToast('Copied'); } }, 'Copy'),
        el('button', { class:'btn secondary', onclick: async ()=>{ renderTemplate(); await addPrompt({ name: 'Saved '+new Date().toLocaleString(), templateId: 'forecast_prompt', values: values, rendered: out.value }); } }, 'Save')
      );

      box.appendChild(form);
      box.appendChild(actions);
      box.appendChild(out);
    });
    return box;
  }
  function PromptLibrary(){ const items = applyFilter(state.prompts); return el('div', { class:'grid cols-2 list' }, ...items.map(p => el('div', { class:'card' }, el('div', { class:'row between' }, el('strong', {}, p.name), el('div', {}, el('button', { class:'btn secondary', onclick: async ()=>{ await navigator.clipboard.writeText(p.rendered||''); showToast('Copied'); } }, 'Copy'), el('button', { class:'btn secondary', onclick: ()=> deletePrompt(p.id) }, 'Delete'))), el('textarea', {}, p.rendered||'')))); }

  // Settings
  function Settings(){ const menu = state.menu || { enableContextMenu:true, items:{ openManager:true, insertExpansion:true, promptEngineer:true } }; const root = el('div', { class:'card' }, el('h3', {}, 'Settings')); const row1 = el('div', { class:'row' }, el('label', {}, 'Enable right-click menu'), el('input', { type:'checkbox', checked: !!menu.enableContextMenu, onchange:(e)=> setMenu({ enableContextMenu: !!e.target.checked, items: menu.items }) })); const row2 = el('div', { class:'row' }, el('label', {}, 'Menu items')); const list = el('div', { class:'grid cols-3' }, Toggle('Open Manager', !!menu.items.openManager, v => setMenu({ items: Object.assign({}, menu.items, { openManager: v }) })), Toggle('Insert Expansion', !!menu.items.insertExpansion, v => setMenu({ items: Object.assign({}, menu.items, { insertExpansion: v }) })), Toggle('Prompt Engineer', !!menu.items.promptEngineer, v => setMenu({ items: Object.assign({}, menu.items, { promptEngineer: v }) })) ); root.appendChild(row1); root.appendChild(row2); root.appendChild(list); root.appendChild(el('hr')); root.appendChild(el('div', { class:'small' }, 'Context menu changes apply immediately.')); return root; }
  function Toggle(label, val, on){ return el('label', {}, el('input', { type:'checkbox', checked: !!val, onchange:(e)=> on(!!e.target.checked) }), ' ', label); }

  // Help
  function Help(){ return el('div', { class:'card' }, el('h3', {}, 'Help'), el('p', {}, 'Triggers: use strings like :date, :sig. Variables can be referenced as {{date}}. Build custom forms with the palette and drag them into the canvas. Right-click on items to see actions. Configure the context menu under Settings.')); }

  // Render
  function render(){ app.innerHTML = ''; app.appendChild(Nav()); if (state.tab !== 'help') app.appendChild(Toolbar()); if (state.tab === 'expansions') app.appendChild(ListExpansions()); if (state.tab === 'variables') app.appendChild(ListVariables()); if (state.tab === 'forms') app.appendChild(Forms()); if (state.tab === 'prompts') app.appendChild(Prompts()); if (state.tab === 'settings') app.appendChild(Settings()); if (state.tab === 'help') app.appendChild(Help()); if (state.toast) app.appendChild(el('div', { class:'toast' }, state.toast)); }

  // Init
  load();
  render();

  /*
  CHANGELOG
  2025-08-11 v1.5.1
  - Prompt Engineer: added variable picker next to each non-enum field so user can drop in {{variable}} values from the Variables library.
  - Everything else from v1.5.0 retained.
  */
})();
