export const SCHEMA_VERSION = 1;

export const VARIABLE_TYPES = [
  "text","custom","number","document","dropdown","checkbox","multiselect","boolean",
  "date","time","datetime","url","email","phone","slider","color","regex","counter","list","map","computed"
];

export const DEFAULT_STATE = {
  _meta: { schemaVersion: SCHEMA_VERSION, createdAt: Date.now(), updatedAt: Date.now() },
  settings: { autoExpand: true, triggerPrefix: ":", caseSensitive: false, theme: "system" },
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
