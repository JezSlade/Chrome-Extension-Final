/*
  background.js - ToolForge
  Service worker for state, storage, context menus, and AI prompt orchestration.
  This patch adds:
    - Menu settings and dynamic Chrome context menus
    - Prompts library (save/load user-filled AI prompts)
    - Form schema pipeline support in state (for the DnD builder in manager)
    - RPCs for menus and prompts

  Notes:
    - No external libraries
    - Comments are exhaustive per Jez's request
*/

// ===============================
// Default State and Prompt Data
// ===============================
const DEFAULT_STATE = {
  config: {
    enabled: true,
    storageArea: 'sync',
    autoSync: false
  },
  // Text expansions library
  expansions: [
    { id: 1, trigger: ':hello', replacement: 'Hello, world!', type: 'text' },
    { id: 2, trigger: ':sig', replacement: 'Best regards,\nJohn Doe', type: 'text' },
    { id: 3, trigger: ':date', replacement: '{{date}}', type: 'text' }
  ],
  // Variable library used when rendering templates
  variables: [
    { id: 1, name: 'date', type: 'formatDate', default: '%Y-%m-%d' },
    { id: 2, name: 'time', type: 'formatDate', default: '%H:%M' }
  ],
  // Forms created in the DnD builder live here
  // Each form: { id, name, description, fields: [ { id, type, label, key, required, options, default } ] }
  forms: [],
  // Saved prompt instances (user-filled versions of prompt templates)
  // Each prompt: { id, name, templateId, values: { fieldName: value }, rendered }
  prompts: [],
  // Right-click context menu settings (can be toggled in Manager Settings)
  menu: {
    enableContextMenu: true,
    items: {
      openManager: true,
      insertExpansion: true,
      promptEngineer: true
    }
  }
};

// Default AI prompt templates and dynamic fields
const DEFAULT_PROMPT_DATA = {
  preamble: `You are a market analyst specializing in short-term trading. Provide balanced, sourced, and safe output.`,
  templates: {
    forecast_prompt: {
      label: 'Short-term Forecast',
      system: 'You are a market analyst specializing in short-term trading.',
      user: [
        'Analyze the following setup:',
        '- Ticker: {ticker}',
        '- Price Range: {price_range}',
        '- Float Size: {float_size}',
        '- Industry: {industry}',
        '- Momentum Indicators: {momentum_indicators}',
        '- Trade Type: {trade_type}',
        '- Recent Catalyst: {catalyst}',
        '- Risk Level: {risk_profile}',
        '- Time Horizon: {time_horizon}',
        'Provide a forecast with entry and exit zones, sentiment bias, and catalyst likelihood.'
      ].join('\n'),
      dynamic_fields: {
        ticker: { type: 'string', label: 'Ticker' },
        price_range: { type: 'range', label: 'Price Range', default: '2 to 10' },
        float_size: { type: 'enum', label: 'Float Size', values: ['ultra-low','low','mid','high'], default: 'mid' },
        industry: { type: 'string', label: 'Industry' },
        momentum_indicators: { type: 'list', label: 'Momentum Indicators', values: ['RSI','MACD','VWAP','Volume Spike','Breakout'], default: ['VWAP'] },
        trade_type: { type: 'enum', label: 'Trade Type', values: ['day','swing'], default: 'day' },
        catalyst: { type: 'string', label: 'Recent Catalyst' },
        risk_profile: { type: 'enum', label: 'Risk Profile', values: ['conservative','moderate','aggressive'], default: 'moderate' },
        time_horizon: { type: 'enum', label: 'Time Horizon', values: ['intraday','1 to 3 days','up to 1 week'], default: '1 to 3 days' }
      }
    }
  }
};

// ===============================
// Storage helpers
// ===============================
const STORAGE = {
  area: 'sync', // 'sync' or 'local'
  getArea() { return this.area === 'local' ? chrome.storage.local : chrome.storage.sync; },
  async get(key) { const a = this.getArea(); return new Promise(r => a.get(key, v => r(v[key]))); },
  async set(key, value) { const a = this.getArea(); return new Promise(r => a.set({ [key]: value }, () => r(true))); }
};

// ===============================
// In-memory state
// ===============================
let STATE = structuredClone(DEFAULT_STATE);
let PROMPT_DATA = structuredClone(DEFAULT_PROMPT_DATA);
let syncing = false;
let lastSyncMs = 0;

// Keys for storage
const KEY_STATE = 'toolforge_state_v1';
const KEY_PROMPT = 'toolforge_prompt_data_v1';

// Utilities
function clone(o){ return JSON.parse(JSON.stringify(o)); }
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
function renderExpansion(exp, variables){
  let out = exp.replacement || '';
  for (const v of variables){ const re = new RegExp('\\{\\{'+v.name+'\\}\\}','g'); out = out.replace(re, computeVar(v)); }
  return out;
}

// Load and save
async function loadAll(){
  const st = await STORAGE.get(KEY_STATE);
  const pr = await STORAGE.get(KEY_PROMPT);
  if (st) STATE = Object.assign(clone(DEFAULT_STATE), st);
  if (pr) PROMPT_DATA = Object.assign(clone(DEFAULT_PROMPT_DATA), pr);
}
async function saveAll(){ await STORAGE.set(KEY_STATE, STATE); await STORAGE.set(KEY_PROMPT, PROMPT_DATA); }

// Optional auto-sync debounce
function now(){ return Date.now(); }
async function tryAutoSync(){ if (!STATE.config.autoSync || syncing) return; const t = now(); if (t - lastSyncMs < 2500) return; syncing = true; lastSyncMs = t; try { await saveAll(); } finally { syncing = false; } }

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== STORAGE.area) return;
  if (changes[KEY_STATE]?.newValue) STATE = Object.assign(clone(DEFAULT_STATE), changes[KEY_STATE].newValue);
  if (changes[KEY_PROMPT]?.newValue) PROMPT_DATA = Object.assign(clone(DEFAULT_PROMPT_DATA), changes[KEY_PROMPT].newValue);
  // When state changes remotely, rebuild context menus to stay in sync
  rebuildContextMenus();
});

// ===============================
// Context Menu Management
// ===============================
const MENU_ROOT_ID = 'toolforge_root';
const MENU_OPEN_MANAGER_ID = 'toolforge_open_manager';
const MENU_PROMPT_ENGINE_ID = 'toolforge_prompt_engineer';
const MENU_EXP_PARENT_ID = 'toolforge_insert_expansion_parent';

async function rebuildContextMenus(){
  try { await chrome.contextMenus.removeAll(); } catch {}
  if (!STATE.menu?.enableContextMenu) return;

  chrome.contextMenus.create({ id: MENU_ROOT_ID, title: 'ToolForge', contexts: ['editable','selection','page'] });

  if (STATE.menu.items?.openManager){
    chrome.contextMenus.create({ id: MENU_OPEN_MANAGER_ID, title: 'Open Manager', parentId: MENU_ROOT_ID, contexts: ['all'] });
  }

  if (STATE.menu.items?.promptEngineer){
    chrome.contextMenus.create({ id: MENU_PROMPT_ENGINE_ID, title: 'Prompt Engineer', parentId: MENU_ROOT_ID, contexts: ['editable','selection','page'] });
  }

  if (STATE.menu.items?.insertExpansion){
    chrome.contextMenus.create({ id: MENU_EXP_PARENT_ID, title: 'Insert Expansion', parentId: MENU_ROOT_ID, contexts: ['editable'] });
    for (const e of STATE.expansions){
      chrome.contextMenus.create({ id: `exp:${e.id}`, title: `${e.trigger}`, parentId: MENU_EXP_PARENT_ID, contexts: ['editable'] });
    }
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;
  if (info.menuItemId === MENU_OPEN_MANAGER_ID){
    const url = chrome.runtime.getURL('ui/manager.html');
    await chrome.tabs.create({ url });
    return;
  }
  if (info.menuItemId === MENU_PROMPT_ENGINE_ID){
    const url = chrome.runtime.getURL('ui/manager.html#prompts');
    await chrome.tabs.create({ url });
    return;
  }
  if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith('exp:')){
    const id = Number(info.menuItemId.split(':')[1]);
    const exp = STATE.expansions.find(x => x.id === id);
    if (!exp) return;
    const text = renderExpansion(exp, STATE.variables);
    // Ask content script to insert at caret
    try { await chrome.tabs.sendMessage(tab.id, { type: 'INSERT_TEXT', text }); } catch {}
    return;
  }
});

// ===============================
// RPC API for UI
// ===============================
const RPC = {
  // Core state
  async GET_STATE(){ return { ok: true, data: clone(STATE) }; },
  async SET_STATE(payload){ if (!payload || typeof payload !== 'object') return { ok:false, error:'Bad payload' }; STATE = Object.assign(clone(STATE), payload); await saveAll(); rebuildContextMenus(); return { ok:true }; },
  async RESET_STATE(){ STATE = clone(DEFAULT_STATE); await saveAll(); rebuildContextMenus(); return { ok:true }; },
  async TOGGLE_ENABLED(){ STATE.config.enabled = !STATE.config.enabled; await saveAll(); return { ok:true, config: clone(STATE.config) }; },
  async SET_STORAGE_AREA({ area }){ if (!['local','sync'].includes(area)) return { ok:false, error:'Invalid area' }; STORAGE.area = area; STATE.config.storageArea = area; await saveAll(); return { ok:true }; },
  async SET_AUTO_SYNC({ value }){ STATE.config.autoSync = !!value; await saveAll(); return { ok:true }; },

  // Expansions
  async LIST_EXPANSIONS(){ return { ok:true, items: clone(STATE.expansions) }; },
  async ADD_EXPANSION({ item }){ if (!item || !item.trigger) return { ok:false, error:'Bad item' }; item.id = Math.max(0, ...STATE.expansions.map(e=>e.id||0)) + 1; STATE.expansions.push(item); await saveAll(); rebuildContextMenus(); return { ok:true, id:item.id }; },
  async UPDATE_EXPANSION({ id, patch }){ const i = STATE.expansions.findIndex(e=>e.id===id); if (i<0) return { ok:false, error:'Not found' }; STATE.expansions[i] = Object.assign({}, STATE.expansions[i], patch); await saveAll(); rebuildContextMenus(); return { ok:true }; },
  async DELETE_EXPANSION({ id }){ STATE.expansions = STATE.expansions.filter(e=>e.id!==id); await saveAll(); rebuildContextMenus(); return { ok:true }; },

  // Variables
  async LIST_VARIABLES(){ return { ok:true, items: clone(STATE.variables) }; },
  async ADD_VARIABLE({ item }){ if (!item || !item.name) return { ok:false, error:'Bad item' }; item.id = Math.max(0, ...STATE.variables.map(v=>v.id||0)) + 1; STATE.variables.push(item); await saveAll(); return { ok:true, id:item.id }; },
  async UPDATE_VARIABLE({ id, patch }){ const i = STATE.variables.findIndex(v=>v.id===id); if (i<0) return { ok:false, error:'Not found' }; STATE.variables[i] = Object.assign({}, STATE.variables[i], patch); await saveAll(); return { ok:true }; },
  async DELETE_VARIABLE({ id }){ STATE.variables = STATE.variables.filter(v=>v.id!==id); await saveAll(); return { ok:true }; },

  // Forms
  async LIST_FORMS(){ return { ok:true, items: clone(STATE.forms) }; },
  async ADD_FORM({ item }){ if (!item || !item.name) return { ok:false, error:'Bad item' }; item.id = Math.max(0, ...STATE.forms.map(f=>f.id||0)) + 1; item.fields ||= []; STATE.forms.push(item); await saveAll(); return { ok:true, id:item.id }; },
  async UPDATE_FORM({ id, patch }){ const i = STATE.forms.findIndex(f=>f.id===id); if (i<0) return { ok:false, error:'Not found' }; STATE.forms[i] = Object.assign({}, STATE.forms[i], patch); await saveAll(); return { ok:true }; },
  async DELETE_FORM({ id }){ STATE.forms = STATE.forms.filter(f=>f.id!==id); await saveAll(); return { ok:true }; },

  // Prompts
  async GET_PROMPT_DATA(){ return { ok:true, data: clone(PROMPT_DATA) }; },
  async LIST_PROMPTS(){ return { ok:true, items: clone(STATE.prompts) }; },
  async ADD_PROMPT({ item }){ if (!item || !item.name || !item.templateId) return { ok:false, error:'Bad item' }; item.id = Math.max(0, ...STATE.prompts.map(p=>p.id||0)) + 1; STATE.prompts.push(item); await saveAll(); return { ok:true, id:item.id }; },
  async UPDATE_PROMPT({ id, patch }){ const i = STATE.prompts.findIndex(p=>p.id===id); if (i<0) return { ok:false, error:'Not found' }; STATE.prompts[i] = Object.assign({}, STATE.prompts[i], patch); await saveAll(); return { ok:true }; },
  async DELETE_PROMPT({ id }){ STATE.prompts = STATE.prompts.filter(p=>p.id!==id); await saveAll(); return { ok:true }; },

  // Menus
  async GET_MENU(){ return { ok:true, menu: clone(STATE.menu) }; },
  async SET_MENU({ menu }){ if (!menu || typeof menu !== 'object') return { ok:false, error:'Bad menu' }; STATE.menu = Object.assign({}, STATE.menu, menu); await saveAll(); rebuildContextMenus(); return { ok:true }; },

  // Manual sync
  async SYNC_PUSH(){ await saveAll(); return { ok:true }; },
  async SYNC_PULL(){ await loadAll(); rebuildContextMenus(); return { ok:true, data: clone(STATE) }; }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      const type = msg && msg.type;
      if (!type || !RPC[type]) return sendResponse({ ok:false, error:'Unknown RPC' });
      const res = await RPC[type](msg);
      sendResponse(res);
      tryAutoSync();
    } catch (e) { sendResponse({ ok:false, error: String(e && e.message || e) }); }
  })();
  return true;
});

// Init
(async function init(){
  await loadAll();
  STORAGE.area = STATE.config.storageArea || 'sync';
  rebuildContextMenus();
})();

/*
CHANGELOG
2025-08-11 v1.5.0
- Added menu settings and dynamic Chrome context menu with subitems for expansions
- Added prompts library and RPCs: GET_PROMPT_DATA, LIST/ADD/UPDATE/DELETE_PROMPT
- Added menu RPCs: GET_MENU, SET_MENU
- Kept all previous state keys; no breaking changes expected
*/
