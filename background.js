import { Storage } from "./js/storage.js";
import { DEFAULT_STATE, SCHEMA_VERSION } from "./js/schema.js";

const storage = new Storage({ area: 'sync', schemaVersion: SCHEMA_VERSION, defaults: DEFAULT_STATE });

chrome.runtime.onInstalled.addListener(async () => {
  const state = await storage.getState();
  if (!state || !state._meta || state._meta.schemaVersion !== SCHEMA_VERSION) {
    await storage.migrateOrInit();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'GET_STATE': {
          sendResponse({ ok: true, state: await storage.getState() });
          break;
        }
        case 'SET_STATE': {
          await storage.setState(msg.state);
          sendResponse({ ok: true });
          break;
        }
        case 'EXPORT_DATA': {
          sendResponse({ ok: true, data: await storage.exportData() });
          break;
        }
        case 'IMPORT_DATA': {
          await storage.importData(msg.data);
          sendResponse({ ok: true });
          break;
        }
        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      chrome.tabs.sendMessage(t.id, { type: 'STATE_CHANGED' }).catch(() => {});
    }
  });
});
