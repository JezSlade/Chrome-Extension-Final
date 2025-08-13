// ui/popup.js - minimal popup to show sync health and link to options
async function getState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, resolve);
  });
}

async function forcePull() {
  // In MV3 storage sync is auto. This button just refreshes local state visual.
  const res = await getState();
  render(res);
}

function render(res) {
  const el = document.getElementById('syncStatus');
  if (!res || !res.ok) {
    el.textContent = "Sync status: error";
    return;
  }
  const s = res.state;
  const meta = s?._meta;
  const when = meta?.updatedAt ? new Date(meta.updatedAt).toLocaleString() : "unknown";
  el.textContent = `Sync status: OK. Updated ${when}`;
}

document.getElementById('openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('forceSync').addEventListener('click', forcePull);

getState().then(render);
