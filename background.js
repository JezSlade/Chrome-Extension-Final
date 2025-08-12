/*
  background.js - ToolForge v2.2.0
  Service worker for state, storage, context menus, and sync.
  - One-time guard on context menu click listener
  - Structured results for SYNC_PUSH and SYNC_PULL
  - Sync Status, Backup, Restore RPCs
  - All Sync writes use chrome.storage.sync.set
  - All Sync reads use chrome.storage.sync.get
*/
const DEFAULT_STATE = {
  config: { enabled: true, storageArea: "sync", autoSync: false, env: {} },
  expansions: [
    { id: 1, trigger: ":hello", replacement: "Hello, world!", type: "text" },
    { id: 2, trigger: ":sig", replacement: "Best regards,\nJohn Doe", type: "text" },
    { id: 3, trigger: ":date", replacement: "{{date:+%Y-%m-%d}}", type: "text" }
  ],
  variables: [
    { id: 1, name: "date", type: "formatDate", default: "%Y-%m-%d" },
    { id: 2, name: "time", type: "formatDate", default: "%H:%M" }
  ],
  forms: [],
  prompts: [],
  menu: { enableContextMenu: true, items: { openManager: true, insertExpansion: true, promptEngineer: true } }
};

const DEFAULT_PROMPT_DATA = {
  preamble: "You are a market analyst specializing in short term trading. Provide balanced, sourced, and safe output.",
  templates: {
    forecast_prompt: {
      label: "Short term Forecast",
      system: "You are a market analyst specializing in short term trading.",
      user: [
        "Analyze the following setup:",
        "- Ticker: {ticker}",
        "- Price Range: {price_range}",
        "- Float Size: {float_size}",
        "- Industry: {industry}",
        "- Momentum Indicators: {momentum_indicators}",
        "- Trade Type: {trade_type}",
        "- Recent Catalyst: {catalyst}",
        "- Risk Level: {risk_profile}",
        "- Time Horizon: {time_horizon}",
        "Provide a forecast with entry and exit zones, sentiment bias, and catalyst likelihood."
      ].join("\n"),
      dynamic_fields: {
        ticker: { type: "string", label: "Ticker" },
        price_range: { type: "range", label: "Price Range", default: "2 to 10" },
        float_size: { type: "enum", label: "Float Size", values: ["ultra-low","low","mid","high"], default: "mid" },
        industry: { type: "string", label: "Industry" },
        momentum_indicators: { type: "list", label: "Momentum Indicators", values: ["RSI","MACD","VWAP","Volume Spike","Breakout"], default: ["VWAP"] },
        trade_type: { type: "enum", label: "Trade Type", values: ["day","swing"], default: "day" },
        catalyst: { type: "string", label: "Recent Catalyst" },
        risk_profile: { type: "enum", label: "Risk Profile", values: ["conservative","moderate","aggressive"], default: "moderate" },
        time_horizon: { type: "enum", label: "Time Horizon", values: ["intraday","1 to 3 days","up to 1 week"], default: "1 to 3 days" }
      }
    }
  }
};

const KEY_STATE = "toolforge_state_v1";
const KEY_PROMPT = "toolforge_prompt_data_v1";
const KEY_META = "toolforge_meta_v1"; // stored in chrome.storage.local

function clone(o){ return JSON.parse(JSON.stringify(o)); }
function sizeOf(obj){ try { return JSON.stringify(obj).length; } catch { return 0; } }

/* Storage facade - explicit areas */
const STORAGE = {
  area: "sync",
  getArea(area) {
    return area === "local" ? chrome.storage.local : chrome.storage.sync;
  },
  async getFrom(area, key) {
    const h = this.getArea(area);
    return new Promise((resolve) => h.get(key, v => resolve(v[key])));
  },
  async setTo(area, key, value) {
    const h = this.getArea(area);
    return new Promise((resolve) => h.set({ [key]: value }, () => resolve(true)));
  }
};

let STATE = clone(DEFAULT_STATE);
let PROMPT_DATA = clone(DEFAULT_PROMPT_DATA);
let META = { lastPushAt: null, lastPullAt: null };

async function loadAll(){
  const st = await STORAGE.getFrom(STORAGE.area, KEY_STATE);
  const pr = await STORAGE.getFrom(STORAGE.area, KEY_PROMPT);
  if (st) STATE = Object.assign(clone(DEFAULT_STATE), st);
  if (pr) PROMPT_DATA = Object.assign(clone(DEFAULT_PROMPT_DATA), pr);
  const metaLocal = await STORAGE.getFrom("local", KEY_META);
  if (metaLocal) META = Object.assign({ lastPushAt: null, lastPullAt: null }, metaLocal);
}
async function saveAll(){
  await STORAGE.setTo(STORAGE.area, KEY_STATE, STATE);
  await STORAGE.setTo(STORAGE.area, KEY_PROMPT, PROMPT_DATA);
}

/* ---------- Context menu rebuild, serialized ---------- */
let menuBuildQueued = false;
let menuBuilding = false;
function scheduleRebuildMenus(){
  if (menuBuilding){ menuBuildQueued = true; return; }
  rebuildContextMenus();
}
async function rebuildContextMenus(){
  menuBuilding = true;
  try {
    await new Promise(res => chrome.contextMenus.removeAll(() => res()));
    if (!STATE.menu?.enableContextMenu) return;
    const guardCreate = (createProps) => { try { chrome.contextMenus.create(createProps); } catch (e) {} };
    guardCreate({ id: "toolforge_root", title: "ToolForge", contexts: ["editable","selection","page"] });
    if (STATE.menu.items?.openManager){
      guardCreate({ id: "toolforge_open_manager", title: "Open Manager", parentId: "toolforge_root", contexts: ["all"] });
    }
    if (STATE.menu.items?.promptEngineer){
      guardCreate({ id: "toolforge_prompt_engineer", title: "Prompt Engineer", parentId: "toolforge_root", contexts: ["editable","selection","page"] });
    }
    if (STATE.menu.items?.insertExpansion){
      guardCreate({ id: "toolforge_insert_expansion_parent", title: "Insert Expansion", parentId: "toolforge_root", contexts: ["editable"] });
      for (const e of STATE.expansions){
        guardCreate({ id: `exp:${e.id}`, title: `${e.trigger || e.pattern || "(expansion)"}`, parentId: "toolforge_insert_expansion_parent", contexts: ["editable"] });
      }
    }
  } finally {
    menuBuilding = false;
    if (menuBuildQueued){ menuBuildQueued = false; scheduleRebuildMenus(); }
  }
}

/* One-time guard to prevent duplicate click handlers */
let menuClickBound = false;
function bindMenuClickOnce(){
  if (menuClickBound) return;
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab || !tab.id) return;
    if (info.menuItemId === "toolforge_open_manager"){
      const url = chrome.runtime.getURL("ui/manager.html");
      try { await chrome.tabs.create({ url }); } catch {}
      return;
    }
    if (info.menuItemId === "toolforge_prompt_engineer"){
      const url = chrome.runtime.getURL("ui/manager.html#prompts");
      try { await chrome.tabs.create({ url }); } catch {}
      return;
    }
    if (typeof info.menuItemId === "string" && info.menuItemId.startsWith("exp:")){
      const id = Number(info.menuItemId.split(":")[1]);
      const exp = STATE.expansions.find(x => x.id === id);
      if (!exp) return;
      const template = String(exp.replacement || "");
      try { await chrome.tabs.sendMessage(tab.id, { type: "APPLY_TEMPLATE", template }); } catch {}
      return;
    }
  });
  menuClickBound = true;
}

/* ---------- Sync helpers ---------- */
function summarize(state, prompt){
  return {
    counts: {
      expansions: (state.expansions || []).length,
      variables: (state.variables || []).length,
      forms: (state.forms || []).length,
      prompts: (state.prompts || []).length,
      menu: state.menu ? 1 : 0
    },
    bytes: {
      [KEY_STATE]: sizeOf(state),
      [KEY_PROMPT]: sizeOf(prompt)
    }
  };
}
function iso(){ return new Date().toISOString().replace(/[:.]/g, "-"); }

async function doPush(){
  // Copy Local -> Sync using explicit sync API
  const localState = await STORAGE.getFrom("local", KEY_STATE);
  const localPrompt = await STORAGE.getFrom("local", KEY_PROMPT);
  const srcState = localState || STATE;
  const srcPrompt = localPrompt || PROMPT_DATA;

  await chrome.storage.sync.set({ [KEY_STATE]: srcState });
  await chrome.storage.sync.set({ [KEY_PROMPT]: srcPrompt });

  META.lastPushAt = new Date().toISOString();
  await chrome.storage.local.set({ [KEY_META]: META });

  const result = Object.assign(
    { op: "push", sourceArea: "local", targetArea: "sync", timestamp: META.lastPushAt },
    summarize(srcState, srcPrompt)
  );
  return result;
}

async function doPull(){
  // Copy Sync -> Local using explicit sync API
  const syncState = await new Promise(res => chrome.storage.sync.get(KEY_STATE, v => res(v[KEY_STATE])));
  const syncPrompt = await new Promise(res => chrome.storage.sync.get(KEY_PROMPT, v => res(v[KEY_PROMPT])));

  if (syncState) await chrome.storage.local.set({ [KEY_STATE]: syncState });
  if (syncPrompt) await chrome.storage.local.set({ [KEY_PROMPT]: syncPrompt });

  // If current area is local, reload in-memory state so Manager reflects pulled data
  if (STORAGE.area === "local") {
    const st = await STORAGE.getFrom("local", KEY_STATE);
    const pr = await STORAGE.getFrom("local", KEY_PROMPT);
    if (st) STATE = Object.assign(clone(DEFAULT_STATE), st);
    if (pr) PROMPT_DATA = Object.assign(clone(DEFAULT_PROMPT_DATA), pr);
    scheduleRebuildMenus();
  }

  META.lastPullAt = new Date().toISOString();
  await chrome.storage.local.set({ [KEY_META]: META });

  const srcState = syncState || {};
  const srcPrompt = syncPrompt || {};
  const result = Object.assign(
    { op: "pull", sourceArea: "sync", targetArea: "local", timestamp: META.lastPullAt },
    summarize(srcState, srcPrompt)
  );
  return result;
}

async function listBackupsSync(){
  const all = await new Promise(res => chrome.storage.sync.get(null, v => res(v || {})));
  const sPrefix = KEY_STATE + "__backup__";
  const pPrefix = KEY_PROMPT + "__backup__";

  const map = {};
  for (const k of Object.keys(all)){
    if (k.startsWith(sPrefix)){
      const id = k.slice(sPrefix.length);
      map[id] = map[id] || {};
      map[id].stateKey = k;
    }
    if (k.startsWith(pPrefix)){
      const id = k.slice(pPrefix.length);
      map[id] = map[id] || {};
      map[id].promptKey = k;
    }
  }
  const list = Object.keys(map).map(id => ({
    id,
    stateKey: map[id].stateKey || null,
    promptKey: map[id].promptKey || null
  })).filter(x => x.stateKey && x.promptKey);
  // Sort by timestamp-like id descending if possible
  list.sort((a,b) => a.id < b.id ? 1 : -1);
  return list;
}

async function backupSync(){
  const syncState = await new Promise(res => chrome.storage.sync.get(KEY_STATE, v => res(v[KEY_STATE])));
  const syncPrompt = await new Promise(res => chrome.storage.sync.get(KEY_PROMPT, v => res(v[KEY_PROMPT])));
  const id = iso();
  const keys = {};
  keys[KEY_STATE + "__backup__" + id] = syncState || {};
  keys[KEY_PROMPT + "__backup__" + id] = syncPrompt || {};
  await chrome.storage.sync.set(keys);
  return { id };
}

async function restoreBackup(id){
  if (!id) throw new Error("Missing backup id");
  const sKey = KEY_STATE + "__backup__" + id;
  const pKey = KEY_PROMPT + "__backup__" + id;
  const data = await new Promise(res => chrome.storage.sync.get([sKey, pKey], v => res(v || {})));
  const st = data[sKey];
  const pr = data[pKey];
  if (!st || !pr) throw new Error("Backup not found or incomplete");
  await chrome.storage.sync.set({ [KEY_STATE]: st, [KEY_PROMPT]: pr });
  return { ok: true };
}

/* ---------- RPC ---------- */
const RPC = {
  async GET_STATE(){ return { ok: true, data: clone(STATE) }; },
  async SET_STATE(payload){ if (!payload || typeof payload !== "object") return { ok:false, error:"Bad payload" }; STATE = Object.assign(clone(STATE), payload); await saveAll(); scheduleRebuildMenus(); return { ok:true }; },
  async RESET_STATE(){ STATE = clone(DEFAULT_STATE); await saveAll(); scheduleRebuildMenus(); return { ok:true }; },
  async TOGGLE_ENABLED(){ STATE.config.enabled = !STATE.config.enabled; await saveAll(); return { ok:true, config: clone(STATE.config) }; },
  async SET_STORAGE_AREA({ area }){
    if (!["local","sync"].includes(area)) return { ok:false, error:"Invalid area" };
    STORAGE.area = area;
    STATE.config.storageArea = area;
    await saveAll();
    await loadAll(); // reflect selected area
    scheduleRebuildMenus();
    return { ok:true, data: clone(STATE) };
  },
  async SET_AUTO_SYNC({ value }){ STATE.config.autoSync = !!value; await saveAll(); return { ok:true }; },

  async LIST_EXPANSIONS(){ return { ok:true, items: clone(STATE.expansions) }; },
  async ADD_EXPANSION({ item }){ if (!item || (!item.trigger && !item.pattern)) return { ok:false, error:"Bad item" }; item.id = Math.max(0, ...STATE.expansions.map(e=>e.id||0)) + 1; STATE.expansions.push(item); await saveAll(); scheduleRebuildMenus(); return { ok:true, id:item.id }; },
  async UPDATE_EXPANSION({ id, patch }){ const i = STATE.expansions.findIndex(e=>e.id===id); if (i<0) return { ok:false, error:"Not found" }; STATE.expansions[i] = Object.assign({}, STATE.expansions[i], patch); await saveAll(); scheduleRebuildMenus(); return { ok:true }; },
  async DELETE_EXPANSION({ id }){ STATE.expansions = STATE.expansions.filter(e=>e.id!==id); await saveAll(); scheduleRebuildMenus(); return { ok:true }; },

  async LIST_VARIABLES(){ return { ok:true, items: clone(STATE.variables) }; },
  async ADD_VARIABLE({ item }){ if (!item || !item.name) return { ok:false, error:"Bad item" }; item.id = Math.max(0, ...STATE.variables.map(v=>v.id||0)) + 1; STATE.variables.push(item); await saveAll(); return { ok:true, id:item.id }; },
  async UPDATE_VARIABLE({ id, patch }){ const i = STATE.variables.findIndex(v=>v.id===id); if (i<0) return { ok:false, error:"Not found" }; STATE.variables[i] = Object.assign({}, STATE.variables[i], patch); await saveAll(); return { ok:true }; },
  async DELETE_VARIABLE({ id }){ STATE.variables = STATE.variables.filter(v=>v.id!==id); await saveAll(); return { ok:true }; },

  async LIST_FORMS(){ return { ok:true, items: clone(STATE.forms) }; },
  async ADD_FORM({ item }){ if (!item || !item.name) return { ok:false, error:"Bad item" }; item.id = Math.max(0, ...STATE.forms.map(f=>f.id||0)) + 1; item.fields ||= []; STATE.forms.push(item); await saveAll(); return { ok:true, id:item.id }; },
  async UPDATE_FORM({ id, patch }){ const i = STATE.forms.findIndex(f=>f.id===id); if (i<0) return { ok:false, error:"Not found" }; STATE.forms[i] = Object.assign({}, STATE.forms[i], patch); await saveAll(); return { ok:true }; },
  async DELETE_FORM({ id }){ STATE.forms = STATE.forms.filter(f=>f.id!==id); await saveAll(); return { ok:true }; },

  async GET_PROMPT_DATA(){ return { ok:true, data: clone(PROMPT_DATA) }; },
  async LIST_PROMPTS(){ return { ok:true, items: clone(STATE.prompts) }; },
  async ADD_PROMPT({ item }){ if (!item || !item.name || !item.templateId) return { ok:false, error:"Bad item" }; item.id = Math.max(0, ...STATE.prompts.map(p=>p.id||0)) + 1; STATE.prompts.push(item); await saveAll(); return { ok:true, id:item.id }; },
  async UPDATE_PROMPT({ id, patch }){ const i = STATE.prompts.findIndex(p=>p.id===id); if (i<0) return { ok:false, error:"Not found" }; STATE.prompts[i] = Object.assign({}, STATE.prompts[i], patch); await saveAll(); return { ok:true }; },
  async DELETE_PROMPT({ id }){ STATE.prompts = STATE.prompts.filter(p=>p.id!==id); await saveAll(); return { ok:true }; },

  async GET_MENU(){ return { ok:true, menu: clone(STATE.menu) }; },
  async SET_MENU({ menu }){ if (!menu || typeof menu !== "object") return { ok:false, error:"Bad menu" }; STATE.menu = Object.assign({}, STATE.menu, menu); await saveAll(); scheduleRebuildMenus(); return { ok:true }; },

  async SYNC_PUSH(){
    const result = await doPush();
    return { ok:true, result };
  },
  async SYNC_PULL(){
    const result = await doPull();
    return { ok:true, result };
  },

  async SYNC_STATUS(){
    const localSt = await STORAGE.getFrom("local", KEY_STATE) || {};
    const localPr = await STORAGE.getFrom("local", KEY_PROMPT) || {};
    const syncSt = await new Promise(res => chrome.storage.sync.get(KEY_STATE, v => res(v[KEY_STATE] || {})));
    const syncPr = await new Promise(res => chrome.storage.sync.get(KEY_PROMPT, v => res(v[KEY_PROMPT] || {})));
    const backups = await listBackupsSync();
    const status = {
      activeArea: STORAGE.area,
      local: Object.assign({ area: "local" }, summarize(localSt, localPr)),
      sync: Object.assign({ area: "sync" }, summarize(syncSt, syncPr)),
      lastPushAt: META.lastPushAt || null,
      lastPullAt: META.lastPullAt || null,
      backups
    };
    return { ok:true, status };
  },
  async SYNC_BACKUP(){
    const r = await backupSync();
    return { ok:true, backup: r };
  },
  async SYNC_RESTORE({ id }){
    if (!id) return { ok:false, error: "Missing backup id" };
    await restoreBackup(id);
    return { ok:true };
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      const type = msg && msg.type;
      if (!type || !RPC[type]) return sendResponse({ ok:false, error:"Unknown RPC" });
      const res = await RPC[type](msg);
      sendResponse(res);
    } catch (e) { sendResponse({ ok:false, error: String(e && e.message || e) }); }
  })();
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== STORAGE.area) return;
  if (changes[KEY_STATE]?.newValue) STATE = Object.assign(clone(DEFAULT_STATE), changes[KEY_STATE].newValue);
  if (changes[KEY_PROMPT]?.newValue) PROMPT_DATA = Object.assign(clone(DEFAULT_PROMPT_DATA), changes[KEY_PROMPT].newValue);
  scheduleRebuildMenus();
});

(async function init(){
  await loadAll();
  STORAGE.area = STATE.config.storageArea || "sync";
  bindMenuClickOnce();
  scheduleRebuildMenus();
})();
