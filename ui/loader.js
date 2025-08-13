// ui/loader.js
// CSP-compliant external bootstrapper for the Manager (Options) page.
// Dynamically imports app.js and surfaces any load/parse error into the UI.

(function(){
  const appUrl = (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function')
    ? chrome.runtime.getURL('ui/app.js')
    : './app.js';

  import(appUrl).catch(err => {
    const el = document.getElementById('app');
    if (el) {
      const msg = (err && (err.message || String(err))) || 'Unknown error';
      el.innerHTML = `<div style="padding:16px;color:#b00020;white-space:pre-wrap">
<strong>Failed to load Manager UI.</strong>\n${msg}
</div>`;
    }
    // eslint-disable-next-line no-console
    console.error('Manager UI failed to load:', err);
  });
})();
