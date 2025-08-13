// content/content.js - input and contentEditable expansion
import { loadCuesAndVars, findCueByTrigger, applyCue } from "../js/cues.js";

let STATE = { cues: [], vars: {}, settings: {} };

async function refreshState() {
  const { cues, vars, settings } = await loadCuesAndVars();
  STATE = { cues, vars, settings };
}

function getActiveEditable() {
  const el = document.activeElement;
  if (!el) return null;
  const isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
  if (isInput) return el;
  if (el.isContentEditable) return el;
  return null;
}

function replaceAtCursorInTextInput(el, trigger, replacement) {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const val = el.value;
  // Find last occurrence of trigger before cursor
  const before = val.slice(0, start);
  const idx = before.lastIndexOf(trigger);
  if (idx === -1) return false;
  const newVal = before.slice(0, idx) + replacement + val.slice(end);
  const newPos = idx + replacement.length;
  el.value = newVal;
  el.setSelectionRange(newPos, newPos);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function replaceAtCursorInContentEditable(el, trigger, replacement) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  // Build context string around caret to find trigger
  const context = range.startContainer;
  if (!context) return false;
  // For simplicity, operate on the text node containing the caret
  const node = context.nodeType === Node.TEXT_NODE ? context : range.startContainer.childNodes[range.startOffset - 1];
  if (!node || node.nodeType !== Node.TEXT_NODE) return false;
  const text = node.nodeValue;
  const caretPos = range.startOffset;
  const left = text.slice(0, caretPos);
  const idx = left.lastIndexOf(trigger);
  if (idx === -1) return false;
  const newText = left.slice(0, idx) + replacement + text.slice(caretPos);
  node.nodeValue = newText;
  // Move caret to end of inserted text
  const newCaret = idx + replacement.length;
  const r = document.createRange();
  r.setStart(node, newCaret);
  r.setEnd(node, newCaret);
  sel.removeAllRanges();
  sel.addRange(r);
  return true;
}

async function tryExpand(trigger) {
  const cue = findCueByTrigger(STATE.cues, trigger);
  if (!cue) return false;
  const out = applyCue(cue, STATE.vars);
  const el = getActiveEditable();
  if (!el) return false;
  let ok = false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    ok = replaceAtCursorInTextInput(el, trigger, out);
  } else if (el.isContentEditable) {
    ok = replaceAtCursorInContentEditable(el, trigger, out);
  }
  return ok;
}

function observeInputs() {
  const handler = async (e) => {
    if (!STATE.settings.autoExpand) return;
    const triggerPrefix = STATE.settings.triggerPrefix || ":";
    // Find last word that begins with triggerPrefix
    const el = getActiveEditable();
    if (!el) return;
    let text = "";
    let caret = 0;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      text = el.value;
      caret = el.selectionStart || 0;
    } else if (el.isContentEditable) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        if (node && node.nodeType === Node.TEXT_NODE) {
          text = node.nodeValue || "";
          caret = range.startOffset || 0;
        }
      }
    }
    const left = text.slice(0, caret);
    const match = left.match(/(:[A-Za-z0-9_\-]+)$/);
    if (!match) return;
    const trig = match[1];
    await tryExpand(trig);
  };

  document.addEventListener('input', handler, true);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'STATE_CHANGED') {
    refreshState();
  }
});

refreshState().then(observeInputs).catch(() => {});
