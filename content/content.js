/*
  content/content.js - ToolForge
  Expands triggers and now also inserts plain text sent from the background via context menu.
*/
(function(){
  let expansions = [];
  let variables = [];
  let enabled = true;

  function pad(n){ return String(n).padStart(2, '0'); }
  function formatDate(fmt, d = new Date()){
    return fmt
      .replace(/%Y/g, String(d.getFullYear()))
      .replace(/%m/g, pad(d.getMonth()+1))
      .replace(/%d/g, pad(d.getDate()))
      .replace(/%H/g, pad(d.getHours()))
      .replace(/%M/g, pad(d.getMinutes()))
      .replace(/%S/g, pad(d.getSeconds()));
  }
  function computeVar(v){ if (!v) return ''; return v.type === 'formatDate' ? formatDate(v.default || '%Y-%m-%d') : (v.default || ''); }
  function render(exp){ let out = exp.replacement || ''; for (const v of variables){ const re = new RegExp('\\{\\{'+v.name+'\\}\\}','g'); out = out.replace(re, computeVar(v)); } return out; }

  function isEditable(el){
    if (!el) return false;
    const tag = (el.tagName||'').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input'){
      const type = (el.type||'').toLowerCase();
      if (type === 'password' || type === 'file') return false;
      return true;
    }
    return !!el.isContentEditable;
  }

  async function refreshState(){
    try { const res = await chrome.runtime.sendMessage({ type: 'GET_STATE' }); if (res && res.ok){ expansions = res.data.expansions||[]; variables = res.data.variables||[]; enabled = !!(res.data.config && res.data.config.enabled); } } catch {}
  }

  function findTrigger(text){
    let match = null;
    for (const e of expansions){ const t = e.trigger || ''; if (!t) continue; if (text.endsWith(t)){ if (!match || t.length > match.trigger.length) match = e; } }
    return match;
  }

  function replaceInInput(el, exp){
    const t = el.value || '';
    const idx = t.lastIndexOf(exp.trigger);
    if (idx < 0) return;
    const before = t.slice(0, idx);
    const after = t.slice(idx + exp.trigger.length);
    const insert = render(exp);
    el.value = before + insert + after;
    const caret = (before + insert).length;
    try { el.setSelectionRange(caret, caret); } catch {}
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function insertTextAtCaret(editable, text){
    if (editable.value != null){
      const start = editable.selectionStart ?? editable.value.length;
      const end = editable.selectionEnd ?? editable.value.length;
      const before = editable.value.slice(0, start);
      const after = editable.value.slice(end);
      editable.value = before + text + after;
      const caret = before.length + text.length;
      try { editable.setSelectionRange(caret, caret); } catch {}
      editable.dispatchEvent(new Event('input', { bubbles: true }));
      editable.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    // contenteditable
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0){ editable.textContent += text; return; }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function replaceInContentEditable(el, exp){
    const t = el.textContent || '';
    const idx = t.lastIndexOf(exp.trigger);
    if (idx < 0) return;
    const before = t.slice(0, idx);
    const after = t.slice(idx + exp.trigger.length);
    const insert = render(exp);
    el.textContent = before + insert + after;
  }

  function handleKey(e){
    if (!enabled) return;
    const el = e.target;
    if (!isEditable(el)) return;
    const value = (el.value != null) ? el.value : el.textContent || '';
    const exp = findTrigger(value);
    if (!exp) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'Tab'){
      if (el.value != null) replaceInInput(el, exp);
      else replaceInContentEditable(el, exp);
    }
  }

  function handleFocus(){ refreshState(); }

  // Listen for background insert requests
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'INSERT_TEXT') return;
    const el = document.activeElement;
    if (!isEditable(el)) return sendResponse && sendResponse({ ok:false, error:'No editable element focused' });
    insertTextAtCaret(el, String(msg.text || ''));
    sendResponse && sendResponse({ ok:true });
  });

  document.addEventListener('keydown', handleKey, true);
  document.addEventListener('focusin', handleFocus, true);
  refreshState();

  /*
  CHANGELOG
  2025-08-11 v1.5.0
  - Added INSERT_TEXT handler to support context menu insertion from background
  - No behavior changes to trigger-based expansion
  */
})();
