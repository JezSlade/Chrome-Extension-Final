import { DEFAULT_STATE, SCHEMA_VERSION } from "./schema.js";

export class Storage {
  constructor({ area = 'sync', schemaVersion = SCHEMA_VERSION, defaults = DEFAULT_STATE } = {}) {
    this.area = area;
    this.schemaVersion = schemaVersion;
    this.defaults = defaults;
  }
  async getState() {
    const data = await chrome.storage[this.area].get('__STATE__');
    return data.__STATE__ || null;
  }
  async setState(state) {
    const s = {
      ...state,
      _meta: { ...(state._meta || {}), schemaVersion: this.schemaVersion, updatedAt: Date.now() }
    };
    await chrome.storage[this.area].set({ __STATE__: s });
  }
  async migrateOrInit() {
    const existing = await this.getState();
    if (!existing) { await this.setState(this.defaults); return; }
    existing._meta = existing._meta || {};
    existing._meta.schemaVersion = this.schemaVersion;
    existing._meta.updatedAt = Date.now();
    await this.setState(existing);
  }
  async exportData() {
    const s = await this.getState();
    return { version: this.schemaVersion, data: s || this.defaults };
  }
  async importData(blob) {
    if (!blob || typeof blob !== 'object' || !blob.data) throw new Error('Invalid import payload');
    await this.setState(blob.data);
  }
}
