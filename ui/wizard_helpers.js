
(function(global){
  const WH = {};
  WH.createToolbar = function(targetId){
    const bar = document.createElement('div'); bar.className = 'toolbar';
    function mk(txt, token){
      const b = document.createElement('button'); b.type = 'button'; b.textContent = txt;
      b.addEventListener('click', ()=>{
        const ta = document.getElementById(targetId);
        const start = ta.selectionStart ?? 0, end = ta.selectionEnd ?? start;
        const val = ta.value, sel = val.slice(start, end);
        const wrapped = token + sel + token;
        ta.value = val.slice(0, start) + wrapped + val.slice(end);
        const pos = start + wrapped.length;
        ta.setSelectionRange(pos, pos); ta.focus();
      });
      return b;
    }
    bar.appendChild(mk('Bold','**'));
    bar.appendChild(mk('Italic','_'));
    bar.appendChild(mk('Code','`'));
    return bar;
  };
  WH.buildPickerEditor = function(type, initial){
    const frag = document.createDocumentFragment();
    const field = document.createElement('div'); field.className = 'field';
    const label = document.createElement('label');
    let input;
    if (type === 'date') { label.textContent = 'Default date'; input = document.createElement('input'); input.type = 'date'; if (typeof initial === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(initial)) input.value = initial; }
    else if (type === 'time') { label.textContent = 'Default time'; input = document.createElement('input'); input.type = 'time'; if (typeof initial === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(initial)) input.value = initial }
    else if (type === 'datetime') { label.textContent = 'Default date time'; input = document.createElement('input'); input.type = 'datetime-local'; if (typeof initial === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(initial)) input.value = initial }
    else if (type === 'color') { label.textContent = 'Default color'; input = document.createElement('input'); input.type = 'color'; input.value = (typeof initial === 'string' && initial.startsWith('#')) ? initial : '#3366ff'; }
    else { label.textContent = 'Default value'; input = document.createElement('input'); input.type = 'text'; input.value = String(initial ?? ''); }
    input.id = 'wh_picker_input'; field.appendChild(label); field.appendChild(input); frag.appendChild(field);
    const metaWrap = document.createElement('div'); metaWrap.className = 'field';
    const metaChk = document.createElement('input'); metaChk.type = 'checkbox'; metaChk.id = 'wh_meta_multistep';
    const metaLbl = document.createElement('label'); metaLbl.textContent = 'Enable multi step items';
    metaWrap.appendChild(metaLbl); metaWrap.appendChild(metaChk);
    const stepsArea = document.createElement('textarea'); stepsArea.id = 'wh_meta_steps'; stepsArea.rows = 4; stepsArea.placeholder = 'One step per line';
    stepsArea.style.display = 'none';
    metaChk.addEventListener('change', ()=>{ stepsArea.style.display = metaChk.checked ? 'block' : 'none'; });
    frag.appendChild(metaWrap); frag.appendChild(stepsArea);
    return { node: frag, getValue: ()=>input.value, getMeta: ()=> ({ multistep: metaChk.checked, steps: stepsArea.value.split('\n').map(s=>s.trim()).filter(Boolean) }) };
  };
  WH.buildOptionsEditor = function(initialOptions, initialDefault, multi){
    const frag = document.createDocumentFragment();
    const lab1 = document.createElement('label'); lab1.textContent = 'Options - one per line';
    const area = document.createElement('textarea'); area.id = 'vw_opts'; area.rows = 6; area.value = (initialOptions||[]).join('\n');
    frag.appendChild(lab1); frag.appendChild(area);
    if (!multi){
      const lab2 = document.createElement('label'); lab2.textContent = 'Default selection';
      const sel = document.createElement('select'); sel.id = 'vw_default_select';
      const sync = ()=>{
        sel.innerHTML = '';
        for (const o of area.value.split('\n').map(s=>s.trim()).filter(Boolean)){
          const op = document.createElement('option'); op.value = op.textContent = o; sel.appendChild(op);
        }
        sel.value = initialDefault && typeof initialDefault === 'string' ? initialDefault : (sel.options[0]?.value || '');
      };
      area.addEventListener('input', sync); sync();
      frag.appendChild(lab2); frag.appendChild(sel);
      return { node: frag, getOptions: ()=> area.value.split('\n').map(s=>s.trim()).filter(Boolean), getDefault: ()=> sel.value };
    } else {
      const lab3 = document.createElement('label'); lab3.textContent = 'Default selection - Ctrl or Cmd for multiple';
      const sel = document.createElement('select'); sel.id = 'vw_default_multi'; sel.multiple = true; sel.size = 6;
      const sync = ()=>{
        const prior = Array.from(sel.selectedOptions).map(o=>o.value);
        sel.innerHTML = '';
        for (const o of area.value.split('\n').map(s=>s.trim()).filter(Boolean)){
          const op = document.createElement('option'); op.value = op.textContent = o; sel.appendChild(op);
        }
        for (const o of sel.options){
          if ((initialDefault||[]).includes(o.value) || prior.includes(o.value)) o.selected = true;
        }
      };
      area.addEventListener('input', sync); sync();
      frag.appendChild(lab3); frag.appendChild(sel);
      return { node: frag, getOptions: ()=> area.value.split('\n').map(s=>s.trim()).filter(Boolean), getDefault: ()=> Array.from(sel.selectedOptions).map(o=>o.value) };
    }
  };
  WH.openModal = function(id){ const el=document.getElementById(id); if (!el) return; el.classList.add('open'); el.setAttribute('aria-hidden','false'); };
  WH.closeModal = function(id){ const el=document.getElementById(id); if (!el) return; el.classList.remove('open'); el.setAttribute('aria-hidden','true'); };
  global.WH = WH;
})(window);
