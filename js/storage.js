// storage.js - mission critical sync layer for settings, variables, cues

import { DEFAULT_STATE, SCHEMA_VERSION } from "./schema.js";

export class Storage {
  constructor({ area = 'sync', schemaVersion = SCHEMA_VERSION, defaults = DEFAULT_STATE } = {}) {
    this.area = area; // 'sync' or 'local'
    this.schemaVersion = schemaVersion;
    this.defaults = defaults;
  }

  async getState() {
    const data = await chrome.storage[this.area].get(null);
    if (!data || Object.keys(data).length === 0) return null;
    return data.__STATE__ || null;
  }

  async setState(state) {
    const s = {
      ...state,
      _meta: {
        ...(state._meta || {}),
        schemaVersion: this.schemaVersion,
        updatedAt: Date.now()
      }
    };
    await chrome.storage[this.area].set({ __STATE__: s });
  }

  async migrateOrInit() {
    const existing = await this.getState();
    if (!existing) {
      await this.setState(this.defaults);
      return;
    }
    // Example migration hook if needed in future
    if (!existing._meta) existing._meta = {};
    existing._meta.schemaVersion = this.schemaVersion;
    existing._meta.updatedAt = Date.now();
    await this.setState(existing);
  }

  async exportData() {
    const s = await this.getState();
    if (!s) return { version: this.schemaVersion, data: this.defaults };
    return { version: this.schemaVersion, data: s };
  }

  async importData(blob) {
    if (!blob || typeof blob !== 'object') throw new Error('Invalid import payload');
    if (!blob.data) throw new Error('Missing data field');
    // Optional: validate schema version or run migrations here
    await this.setState(blob.data);
  }
}
