import { renderTemplate } from "../js/cues.js";

let STATE = { cues: [], vars: {}, settings: {} };

async function refreshState() {
  const data = await chrome.storage.sync.get('__STATE__');
  const state = data.__STATE__ || {};
  const mapVars = {};
  for (const v of state.variables || []) {
    mapVars[v.id] = { type: v.type, default: v.default, value: v.default ?? "" };
  }
  STATE = { cues: (state.cues || []).filter(c=>c.enabled!==false), vars: mapVars, settings: state.settings || {} };
}
chrome.runtime.onMessage.addListener((msg)=>{ if (msg?.type==='STATE_CHANGED') refreshState(); });

function activeEditable() {
  const el = document.activeElement;
  if (!el) return null;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el;
  if (el.isContentEditable) return el;
  return null;
}

function replaceInInput(el, trigger, repl) {
  const start = el.selectionStart, end = el.selectionEnd;
  const before = el.value.slice(0, start);
  const idx = before.lastIndexOf(trigger);
  if (idx === -1) return false;
  el.value = before.slice(0, idx) + repl + el.value.slice(end);
  const pos = idx + repl.length;
  el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function replaceInCE(el, trigger, repl) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer : null;
  if (!node) return false;
  const left = node.nodeValue.slice(0, range.startOffset);
  const idx = left.lastIndexOf(trigger);
  if (idx === -1) return false;
  node.nodeValue = left.slice(0, idx) + repl + node.nodeValue.slice(range.startOffset);
  const pos = idx + repl.length;
  const r = document.createRange();
  r.setStart(node, pos); r.setEnd(node, pos);
  sel.removeAllRanges(); sel.addRange(r);
  return true;
}

async function tryExpand(trigger) {
  const cue = STATE.cues.find(c => c.trigger === trigger);
  if (!cue) return false;
  const out = renderTemplate(cue.template, STATE.vars);
  const el = activeEditable();
  if (!el) return false;
  return el.isContentEditable ? replaceInCE(el, trigger, out) : replaceInInput(el, trigger, out);
}

function watch() {
  document.addEventListener('input', async () => {
    if (!STATE.settings.autoExpand) return;
    const el = activeEditable(); if (!el) return;
    let text = "", caret = 0;
    if (el.isContentEditable) {
      const sel = getSelection(); if (!sel || !sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      if (r.startContainer.nodeType !== Node.TEXT_NODE) return;
      text = r.startContainer.nodeValue || ""; caret = r.startOffset;
    } else {
      text = el.value; caret = el.selectionStart || 0;
    }
    const left = text.slice(0, caret);
    const m = left.match(/(:[A-Za-z0-9_\-]+)$/);
    if (!m) return;
    await tryExpand(m[1]);
  }, true);
}
refreshState().then(watch);
