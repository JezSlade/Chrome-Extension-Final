async function getState() { return new Promise(r => chrome.runtime.sendMessage({ type: 'GET_STATE' }, r)); }
document.getElementById('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
getState().then(res => {
  const el = document.getElementById('syncStatus');
  if (!res || !res.ok) { el.textContent = "Sync status: error"; return; }
  const s = res.state, when = s?._meta?.updatedAt ? new Date(s._meta.updatedAt).toLocaleString() : "unknown";
  el.textContent = `Sync status: OK. Updated ${when}`;
});
