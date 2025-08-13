// schema.js - Source of truth for data model and defaults

export const SCHEMA_VERSION = 1;

// Variable types catalog
export const VARIABLE_TYPES = [
  "text",           // free text
  "custom",         // user defined alias or ref
  "number",         // numeric
  "document",       // large text blob
  "dropdown",       // single select
  "checkbox",       // boolean check
  "multiselect",    // multi select
  "boolean",        // true or false
  "date",           // date format with strftime-like pattern
  "time",           // time
  "datetime",       // date-time
  "url",
  "email",
  "phone",
  "slider",
  "color",
  "regex",
  "counter",
  "list",
  "map",
  "computed"        // computed by formula or rule
];

// Default state, minimal sample cues and vars
export const DEFAULT_STATE = {
  _meta: {
    schemaVersion: SCHEMA_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  settings: {
    autoExpand: true,
    triggerPrefix: ":",   // triggers begin with ":" by default
    caseSensitive: false,
    theme: "system"       // light, dark, system
  },
  variables: [
    { id: "date", type: "date", default: "%Y-%m-%d", label: "Current Date" },
    { id: "time", type: "time", default: "%H:%M", label: "Current Time" }
  ],
  cues: [
    { id: "cue_email", trigger: ":email", template: "john.doe@example.com", enabled: true },
    { id: "cue_sig", trigger: ":sig", template: "Best regards,\nJohn Doe", enabled: true },
    { id: "cue_date", trigger: ":date", template: "{{date}}", enabled: true }
  ]
};
