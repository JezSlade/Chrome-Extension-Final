// cues.js - cue resolution and template rendering with simple tags

import { DEFAULT_STATE } from "./schema.js";

function formatDate(fmt) {
  const d = new Date();
  const pad = (n, w=2) => String(n).padStart(w, '0');
  return fmt
    .replace(/%Y/g, String(d.getFullYear()))
    .replace(/%m/g, pad(d.getMonth() + 1))
    .replace(/%d/g, pad(d.getDate()))
    .replace(/%H/g, pad(d.getHours()))
    .replace(/%M/g, pad(d.getMinutes()))
    .replace(/%S/g, pad(d.getSeconds()));
}

export function renderTemplate(tpl, vars) {
  // Handle {{date:%Y-%m-%d}} or {{date}} using variables
  return tpl.replace(/\{\{([^}]+)\}\}/g, (m, key) => {
    const [name, param] = String(key).split(':', 2);
    if (name === 'date') {
      const fmt = param || (vars?.date?.default ?? "%Y-%m-%d");
      return formatDate(fmt);
    }
    if (name === 'time') {
      const fmt = param || (vars?.time?.default ?? "%H:%M");
      return formatDate(fmt);
    }
    // Fallback to provided variables map
    const v = vars?.[name];
    if (v && typeof v === 'object' && 'value' in v) return String(v.value);
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    return ''; // unknown var -> empty
  });
}

export async function loadCuesAndVars() {
  const data = await chrome.storage.sync.get('__STATE__');
  const state = data.__STATE__ || DEFAULT_STATE;
  const mapVars = {};
  for (const v of state.variables || []) {
    mapVars[v.id] = { type: v.type, default: v.default, value: v.default ?? "" };
  }
  const cues = (state.cues || []).filter(c => c.enabled !== false);
  return { cues, vars: mapVars, settings: state.settings || {} };
}

export function findCueByTrigger(cues, trigger) {
  return cues.find(c => c.trigger === trigger) || null;
}

export function applyCue(cue, vars) {
  return renderTemplate(cue.template, vars);
}
