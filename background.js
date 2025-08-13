/* background.js - MV3 Service Worker
   - Compatibility RPC layer: supports both { action, payload } and { type, ...fields }
   - Accepts legacy actions (ADD_VARIABLE, LIST_PROMPTS, etc.) and generic CRUD (GET/CREATE/UPDATE/DELETE_ELEMENT[S])
   - Uses chrome.storage.(sync|local) as configured
*/

let storageArea = chrome.storage.sync;

// -------- Utilities --------
function normalizeMessage(msg) {
  // Accept both { action } and { type }
  const action = msg && (msg.action || msg.type);
  // Prefer nested payload; else synthesize from top-level fields except action/type
  const nested = (msg && msg.payload) || {};
  const top = Object.assign({}, msg);
  delete top.action; delete top.type; delete top.payload;
  const payload = Object.keys(nested).length ? nested : top;
  return { action, payload };
}

function now(){ return Date.now(); }
function uid(){ return Math.floor(Math.random() * 1e9); }

// Storage helpers (collections stored by key)
async function readAll(keys) {
  return new Promise(resolve => {
    storageArea.get(keys, items => resolve(items || {}));
  });
}
async function readCollection(key) {
  const obj = await readAll([key]);
  return Array.isArray(obj[key]) ? obj[key] : [];
}
async function writeCollection(key, arr) {
  return new Promise(resolve => storageArea.set({ [key]: arr }, resolve));
}

// Map legacy form-element calls that sometimes flow through variables
function isFormElement(item){ return item && (item.kind === 'formElement' || item.type === 'form'); }

// -------- CRUD Core --------
async function listElements(kind){
  if (kind === 'variables') return readCollection('variables');
  if (kind === 'forms')     return readCollection('forms');
  if (kind === 'prompts')   return readCollection('prompts');
  // Fallback: unknown collection
  return [];
}
async function createElement(kind, data){
  const item = Object.assign({ id: uid(), createdAt: now(), updatedAt: now() }, data || {});
  if (kind === 'variables'){
    // If caller misroutes a form element into variables, route to forms
    if (isFormElement(item)) return createElement('forms', item);
    const arr = await readCollection('variables');
    arr.push(item);
    await writeCollection('variables', arr);
    return { success:true, id: item.id };
  }
  if (kind === 'forms'){
    const arr = await readCollection('forms');
    arr.push(item);
    await writeCollection('forms', arr);
    return { success:true, id: item.id };
  }
  if (kind === 'prompts'){
    const arr = await readCollection('prompts');
    arr.push(item);
    await writeCollection('prompts', arr);
    return { success:true, id: item.id };
  }
  return { success:false, error:'Unknown collection' };
}
async function updateElement(kind, id, patch){
  const arr = await listElements(kind);
  const idx = arr.findIndex(x => x && x.id === id);
  if (idx === -1) return { success:false, error:'Not found' };
  arr[idx] = Object.assign({}, arr[idx], patch || {}, { updatedAt: now() });
  await writeCollection(kind, arr);
  return { success:true };
}
async function deleteElement(kind, id){
  const arr = await listElements(kind);
  const next = arr.filter(x => x && x.id !== id);
  await writeCollection(kind, next);
  return { success:true };
}

// -------- Higher-level state (for GET_STATE) --------
async function getState() {
  const [variables, forms, prompts] = await Promise.all([
    readCollection('variables'),
    readCollection('forms'),
    readCollection('prompts')
  ]);
  // Backward-compat: some form elements may have been saved under variables with kind:'formElement'
  const misfiledForms = (variables || []).filter(isFormElement);
  const cleanVars = (variables || []).filter(v => !isFormElement(v));

  const allForms = (forms || []).concat(misfiledForms);
  return { data: { variables: cleanVars, forms: allForms, prompts } };
}

// -------- Optional AI library grouping for UI convenience --------
function groupBy(items, key){
  const out = {};
  (items || []).forEach(it => {
    const k = (it && it[key]) || 'default';
    (out[k] || (out[k] = [])).push(it);
  });
  return out;
}
async function listAiLibrary(){
  const prompts = await readCollection('prompts');
  const byProvider = groupBy(prompts, 'provider');
  const grouped = {};
  Object.keys(byProvider).forEach(p => { grouped[p] = groupBy(byProvider[p], 'model'); });
  return grouped;
}

// -------- Message Router --------
chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  const { action, payload } = normalizeMessage(raw);

  // Generic CRUD
  if (action === 'GET_ELEMENTS') {
    listElements(payload.type).then(items => sendResponse({ items })).catch(e => sendResponse({ error: e?.message || String(e) }));
    return true;
  }
  if (action === 'CREATE_ELEMENT') {
    createElement(payload.type, payload.data).then(sendResponse).catch(e => sendResponse({ error: e?.message || String(e) }));
    return true;
  }
  if (action === 'UPDATE_ELEMENT') {
    updateElement(payload.type, payload.id, payload.data).then(sendResponse).catch(e => sendResponse({ error: e?.message || String(e) }));
    return true;
  }
  if (action === 'DELETE_ELEMENT') {
    deleteElement(payload.type, payload.id).then(sendResponse).catch(e => sendResponse({ error: e?.message || String(e) }));
    return true;
  }

  // Back-compat: Variables routed actions (may include forms)
  if (action === 'ADD_VARIABLE') {
    const item = payload.item;
    const target = isFormElement(item) ? 'forms' : 'variables';
    createElement(target, item).then(sendResponse).catch(e => sendResponse({ error:String(e) }));
    return true;
  }
  if (action === 'UPDATE_VARIABLE') {
    // Decide collection by hint if provided or try variables first, then forms
    const col = payload.collection || 'variables';
    updateElement(col, payload.id, payload.patch)
      .then(res => res.success ? res : updateElement('forms', payload.id, payload.patch))
      .then(sendResponse).catch(e => sendResponse({ error:String(e) }));
    return true;
  }
  if (action === 'DELETE_VARIABLE') {
    const col = payload.collection || 'variables';
    deleteElement(col, payload.id)
      .then(res => res.success ? res : deleteElement('forms', payload.id))
      .then(sendResponse).catch(e => sendResponse({ error:String(e) }));
    return true;
  }

  // Back-compat: Prompts actions
  if (action === 'LIST_PROMPTS') {
    listElements('prompts').then(items => sendResponse({ items })).catch(e => sendResponse({ error:String(e) }));
    return true;
  }
  if (action === 'ADD_PROMPT') {
    createElement('prompts', payload.item).then(sendResponse).catch(e => sendResponse({ error:String(e) }));
    return true;
  }
  if (action === 'UPDATE_PROMPT') {
    updateElement('prompts', payload.id, payload.patch).then(sendResponse).catch(e => sendResponse({ error:String(e) }));
    return true;
  }
  if (action === 'DELETE_PROMPT') {
    deleteElement('prompts', payload.id).then(sendResponse).catch(e => sendResponse({ error:String(e) }));
    return true;
  }

  // State & Sync
  if (action === 'GET_STATE') {
    getState().then(sendResponse).catch(e => sendResponse({ error:String(e) }));
    return true;
  }
  if (action === 'LIST_AI_LIBRARY') {
    listAiLibrary().then(grouped => sendResponse({ success: true, grouped })).catch(e => sendResponse({ error:String(e) }));
    return true;
  }
  if (action === 'SET_STORAGE_AREA') {
    storageArea = payload.area === 'local' ? chrome.storage.local : chrome.storage.sync;
    sendResponse({ success: true });
    return true;
  }
  if (action === 'SYNC_PUSH' || action === 'SYNC_PULL') {
    // No-op sync placeholders (storage is already live)
    sendResponse({ ok: true, details: 'noop' });
    return true;
  }

  // Unknown
  // eslint-disable-next-line no-console
  console.warn('Unknown action:', action, 'raw:', raw);
  sendResponse({ error: 'Unknown action: ' + action });
  return false;
});

// Broadcast storage changes relevant to current area
chrome.storage.onChanged.addListener((changes, areaName) => {
  const currentName = (storageArea === chrome.storage.sync) ? 'sync' : 'local';
  if (areaName === currentName) {
    chrome.runtime.sendMessage({ action: 'ELEMENTS_UPDATED', changes });
  }
});
// eslint-disable-next-line no-console
console.log('background.js loaded (compat RPC, collections: variables/forms/prompts)');
