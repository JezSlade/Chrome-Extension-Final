/*
  background.js - ToolForge v2.0.1
  Service worker for state, storage, context menus, and prompts.
  Serialized context menu rebuild to avoid duplicate ID errors.
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
const STORAGE = {
  area: "sync",
  getArea() { return this.area === "local" ? chrome.storage.local : chrome.storage.sync; },
  async get(key) { const a = this.getArea(); return new Promise(r => a.get(key, v => r(v[key]))); },
  async set(key, value) { const a = this.getArea(); return new Promise(r => a.set({ [key]: value }, () => r(true))); }
};
let STATE = structuredClone(DEFAULT_STATE);
let PROMPT_DATA = structuredClone(DEFAULT_PROMPT_DATA);
const KEY_STATE = "toolforge_state_v1";
const KEY_PROMPT = "toolforge_prompt_data_v1";
function clone(o){ return JSON.parse(JSON.stringify(o)); }
async function loadAll(){
  const st = await STORAGE.get(KEY_STATE);
  const pr = await STORAGE.get(KEY_PROMPT);
  if (st) STATE = Object.assign(clone(DEFAULT_STATE), st);
  if (pr) PROMPT_DATA = Object.assign(clone(DEFAULT_PROMPT_DATA), pr);
}
async function saveAll(){
  await STORAGE.set(KEY_STATE, STATE);
  await STORAGE.set(KEY_PROMPT, PROMPT_DATA);
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== STORAGE.area) return;
  if (changes[KEY_STATE]?.newValue) STATE = Object.assign(clone(DEFAULT_STATE), changes[KEY_STATE].newValue);
  if (changes[KEY_PROMPT]?.newValue) PROMPT_DATA = Object.assign(clone(DEFAULT_PROMPT_DATA), changes[KEY_PROMPT].newValue);
  scheduleRebuildMenus();
});
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
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;
  if (info.menuItemId === "toolforge_open_manager"){
    const url = chrome.runtime.getURL("ui/manager.html");
    await chrome.tabs.create({ url });
    return;
  }
  if (info.menuItemId === "toolforge_prompt_engineer"){
    const url = chrome.runtime.getURL("ui/manager.html#prompts");
    await chrome.tabs.create({ url });
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
const RPC = {
  async GET_STATE(){ return { ok: true, data: clone(STATE) }; },
  async SET_STATE(payload){ if (!payload || typeof payload !== "object") return { ok:false, error:"Bad payload" }; STATE = Object.assign(clone(STATE), payload); await saveAll(); scheduleRebuildMenus(); return { ok:true }; },
  async RESET_STATE(){ STATE = clone(DEFAULT_STATE); await saveAll(); scheduleRebuildMenus(); return { ok:true }; },
  async TOGGLE_ENABLED(){ STATE.config.enabled = !STATE.config.enabled; await saveAll(); return { ok:true, config: clone(STATE.config) }; },
  async SET_STORAGE_AREA({ area }){ if (!["local","sync"].includes(area)) return { ok:false, error:"Invalid area" }; STORAGE.area = area; STATE.config.storageArea = area; await saveAll(); return { ok:true }; },
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
  async SYNC_PUSH(){ await saveAll(); return { ok:true }; },
  async SYNC_PULL(){ await loadAll(); scheduleRebuildMenus(); return { ok:true, data: clone(STATE) }; }
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
(async function init(){
  await loadAll();
  STORAGE.area = STATE.config.storageArea || "sync";
  scheduleRebuildMenus();
})();
