/*
  Service worker: manages shared state and messaging.
  Adds first-run defaults and storage migrations.
*/

const DEFAULT_EXPANSIONS = [
  { id: 1, trigger: ":email", replacement: "john.doe@example.com", type: "text" },
  { id: 2, trigger: ":sig", replacement: "Best regards,\nJohn Doe", type: "text" },
  { id: 3, trigger: ":date", replacement: "{{date}}", type: "text" },
  { id: 4, trigger: ":time", replacement: "{{time}}", type: "text" }
];

const DEFAULT_VARIABLES = [
  { id: 1, name: "date", type: "date", default: "%Y-%m-%d" },
  { id: 2, name: "time", type: "shell", default: "date +%H:%M" },
  { id: 3, name: "username", type: "text", default: "user" }
];

const DEFAULT_FORMS = [
  {
    id: 1,
    name: "Quick Form",
    template: "Name: {{name}}\nEmail: {{email}}\nNotes: {{notes}}",
    fields: [
      { id: 101, name: "name", type: "text", default: "{{username}}" },
      { id: 102, name: "email", type: "text", default: "user@example.com" },
      { id: 103, name: "notes", type: "multiline", default: "" }
    ]
  }
];

const DEFAULT_CONFIG = {
  auto_restart: true,
  show_notifications: true,
  toggle_key: "ALT+SPACE",
  backend: "Auto",
  clipboard_threshold: 100,
  enabled: true
};

async function migrateStorage() {
  const stored = await chrome.storage.local.get(null);
  const patch = {};

  // Seed defaults
  if (!stored.expansions) patch.expansions = DEFAULT_EXPANSIONS;
  if (!stored.variables) patch.variables = DEFAULT_VARIABLES;
  if (!stored.forms && !stored.formFields) patch.forms = DEFAULT_FORMS;
  if (!stored.config) patch.config = DEFAULT_CONFIG;

  // Migrate legacy formFields -> forms
  if (!stored.forms && stored.formFields) {
    patch.forms = [
      {
        id: Date.now(),
        name: "Migrated Form",
        template: "Form values:\n" + (stored.formFields || []).map(f => `${f.name}: {{${f.name}}}`).join("\n"),
        fields: (stored.formFields || []).map(f => ({
          id: Date.now() + Math.floor(Math.random() * 10000),
          name: f.name,
          type: f.type || "text",
          default: f.default || ""
        }))
      }
    ];
    patch._migrated = true;
  }

  if (Object.keys(patch).length) {
    await chrome.storage.local.set(patch);
  }
}

chrome.runtime.onInstalled.addListener(migrateStorage);
chrome.runtime.onStartup.addListener(migrateStorage);

// Messaging
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === "GET_STATE") {
    chrome.storage.local.get(["expansions", "variables", "config", "forms"]).then((data) => {
      sendResponse({ ok: true, data });
    });
    return true;
  }

  if (msg.type === "SET_STATE") {
    chrome.storage.local.set(msg.payload || {}).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "TOGGLE_ENABLED") {
    chrome.storage.local.get(["config"]).then(({ config }) => {
      const next = { ...(config || DEFAULT_CONFIG), enabled: !((config || DEFAULT_CONFIG).enabled) };
      chrome.storage.local.set({ config: next }).then(() => sendResponse({ ok: true, config: next }));
    });
    return true;
  }
});