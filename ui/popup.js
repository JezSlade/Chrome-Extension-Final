// ui/popup.js - ToolForge v2.1.0
// Push and Pull wired to background sync with visible results.

(function(){
  const $ = (s) => document.querySelector(s);
  const toast = (msg) => {
    const t = $('#toast');
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(()=>{ t.style.display = 'none'; }, 1600);
  };

  async function rpc(type, payload){
    return new Promise((resolve) => chrome.runtime.sendMessage({ type, ...(payload||{}) }, resolve));
  }

  function fmtCounts(r){
    const c = r.counts || {};
    return `expansions: ${c.expansions || 0}, variables: ${c.variables || 0}, forms: ${c.forms || 0}, prompts: ${c.prompts || 0}, menu: ${c.menu || 0}`;
  }
  function fmtBytes(r){
    const b = r.bytes || {};
    const ks = Object.keys(b).map(k => `${k}: ${b[k]} bytes`).join(' • ');
    return ks || 'n/a';
  }
  function renderResult(ok, res){
    const el = $('#result');
    if (!ok){
      el.innerHTML = `<div class="err">Error: ${res && res.error ? res.error : 'Unknown error'}</div>`;
      return;
    }
    const r = res.result || {};
    el.innerHTML = [
      `<div class="ok">Success</div>`,
      `<div>Op: <code>${r.op || ''}</code></div>`,
      `<div>From: <code>${r.sourceArea || ''}</code> → To: <code>${r.targetArea || ''}</code></div>`,
      `<div>When: <code>${r.timestamp || ''}</code></div>`,
      `<div>Counts: ${fmtCounts(r)}</div>`,
      `<div>Bytes: ${fmtBytes(r)}</div>`
    ].join('');
  }
  function renderArea(state){
    const el = $('#area');
    if (!state) { el.textContent = ''; return; }
    el.innerHTML = `Active storage area: <code>${state.config && state.config.storageArea || 'sync'}</code>`;
  }

  async function refreshArea(){
    const res = await rpc('GET_STATE');
    if (res && res.ok) renderArea(res.data);
  }

  // Wire buttons
  $('#push').addEventListener('click', async ()=>{
    const res = await rpc('SYNC_PUSH');
    renderResult(res && res.ok, res);
    toast(res && res.ok ? 'Pushed to Sync' : 'Push failed');
  });
  $('#pull').addEventListener('click', async ()=>{
    const res = await rpc('SYNC_PULL');
    renderResult(res && res.ok, res);
    toast(res && res.ok ? 'Pulled to Local' : 'Pull failed');
  });
  $('#openManager').addEventListener('click', async ()=>{
    const url = chrome.runtime.getURL('ui/manager.html');
    try { await chrome.tabs.create({ url }); } catch {}
  });

  // Initial
  refreshArea().catch(()=>{});
})();
