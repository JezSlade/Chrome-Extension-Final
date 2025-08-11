async function rpc(type, payload) { const res = await chrome.runtime.sendMessage({ type, ...payload }); if (!res || !res.ok) throw new Error(res && res.error || "Unknown error"); return res; }

async function load() {
  const { data } = await rpc("GET_STATE");
  const enabledEl = document.getElementById("enabledToggle");
  const statusLabel = document.getElementById("statusLabel");
  const expCount = document.getElementById("expCount");
  const storageArea = document.getElementById("storageArea");
  const autoSync = document.getElementById("autoSync");

  enabledEl.checked = !!data.config.enabled;
  statusLabel.textContent = data.config.enabled ? "Enabled" : "Disabled";
  expCount.textContent = `${(data.expansions||[]).length} expansions • ${(data.forms||[]).length} forms • ${(data.variables||[]).length} vars`;

  storageArea.value = data.config.storageArea || "sync";
  autoSync.checked = !!data.config.autoSync;

  enabledEl.addEventListener("change", async () => {
    const res = await rpc("TOGGLE_ENABLED");
    const now = res.config.enabled;
    statusLabel.textContent = now ? "Enabled" : "Disabled";
  });

  storageArea.addEventListener("change", async (e) => { const area = e.target.value; await rpc("SET_STORAGE_AREA", { area }); });
  autoSync.addEventListener("change", async (e) => { await rpc("SET_AUTO_SYNC", { value: e.target.checked }); });

  document.getElementById("openManager").addEventListener("click", async (e) => { e.preventDefault(); const url = chrome.runtime.getURL("ui/manager.html"); await chrome.tabs.create({ url }); });
  document.getElementById("syncPush").addEventListener("click", async (e) => { e.preventDefault(); await rpc("SYNC_PUSH"); });
  document.getElementById("syncPull").addEventListener("click", async (e) => { e.preventDefault(); await rpc("SYNC_PULL"); await load(); });
}

document.addEventListener("DOMContentLoaded", load);

/*
CHANGELOG
2025-08-11 v1.5.0
- No functional change; updated labels for ToolForge
*/
