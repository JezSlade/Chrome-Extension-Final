// background.js - MV3 service worker
// State, sync, and message RPCs. No inline code anywhere.

import { Storage } from "./js/storage.js";
import { DEFAULT_STATE, SCHEMA_VERSION } from "./js/schema.js";

const storage = new Storage({
  area: 'sync', // mission critical sync
  schemaVersion: SCHEMA_VERSION,
  defaults: DEFAULT_STATE
});

chrome.runtime.onInstalled.addListener(async (details) => {
  // Ensure defaults on install or update without stomping user data.
  const state = await storage.getState();
  if (!state || !state._meta || state._meta.schemaVersion !== SCHEMA_VERSION) {
    await storage.migrateOrInit();
  }
  // Context menu for quick add if desired later.
  // Disabled by default to keep permissions lean.
});

// Central message router for UI and content
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'GET_STATE': {
          const s = await storage.getState();
          sendResponse({ ok: true, state: s });
          break;
        }
        case 'SET_STATE': {
          await storage.setState(msg.state);
          sendResponse({ ok: true });
          break;
        }
        case 'EXPORT_DATA': {
          const exportBlob = await storage.exportData();
          sendResponse({ ok: true, data: exportBlob });
          break;
        }
        case 'IMPORT_DATA': {
          await storage.importData(msg.data);
          sendResponse({ ok: true });
          break;
        }
        case 'PING': {
          sendResponse({ ok: true, pong: true });
          break;
        }
        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  })();
  return true; // async response
});

// Sync change mirror to tabs that have content.js active
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== storage.area) return;
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      chrome.tabs.sendMessage(t.id, { type: 'STATE_CHANGED' }).catch(() => {});
    }
  });
});
