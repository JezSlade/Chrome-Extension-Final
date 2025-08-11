async function queryState() {
  const res = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  return res?.data || {};
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

document.getElementById("openManager").addEventListener("click", openOptions);

document.getElementById("reloadTab").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) chrome.tabs.reload(tab.id);
});

(async function init() {
  const enabledEl = document.getElementById("enabled");
  const statusLabel = document.getElementById("statusLabel");
  const expCount = document.getElementById("expCount");

  const state = await queryState();
  const config = state.config || { enabled: true };
  const expansions = state.expansions || [];
  const forms = state.forms || [];
  const variables = state.variables || [];

  enabledEl.checked = !!config.enabled;
  statusLabel.textContent = config.enabled ? "Enabled" : "Disabled";
  expCount.textContent = `${expansions.length} expansions • ${forms.length} forms • ${variables.length} vars`;

  enabledEl.addEventListener("change", async () => {
    const res = await chrome.runtime.sendMessage({ type: "TOGGLE_ENABLED" });
    const now = res?.config?.enabled;
    statusLabel.textContent = now ? "Enabled" : "Disabled";
  });
})();