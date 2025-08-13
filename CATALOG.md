# Feature Catalog and Variable Types

## Features
- MV3 service worker background for state and RPC
- Storage abstraction over `chrome.storage.sync` as the single source of truth
- Schema versioning with migrate or init boot logic
- Options page to manage:
  - Settings: triggerPrefix, autoExpand, theme
  - Cues: enable, trigger, template, delete, add
  - Variables: id, type, default, label, delete, add
- Import and Export of full state as JSON file
- Popup shows sync status and opens Options
- Content script detects triggers and replaces near caret in:
  - `<input>` and `<textarea>`
  - `contentEditable` elements
- Simple template engine:
  - `{{date}}`, `{{date:%Y-%m-%d}}`
  - `{{time}}`, `{{time:%H:%M}}`
  - `{{varId}}` for any variable with a default
- Strict CSP compliance. No inline code anywhere.
- No framework dependency. Pure Web APIs.

## Variable Types
- text
- custom
- number
- document
- dropdown
- checkbox
- multiselect
- boolean
- date
- time
- datetime
- url
- email
- phone
- slider
- color
- regex
- counter
- list
- map
- computed

## Files
- `manifest.json`
- `background.js`
- `js/storage.js`
- `js/schema.js`
- `js/cues.js`
- `js/utils.js`
- `content/content.js`
- `ui/popup.html`, `ui/popup.js`, `ui/options.html`, `ui/options.js`, `ui/styles.css`
- `data/import_template.json`
- `assets/icon*.png`
- `README.md`, `CATALOG.md`, `TESTS.md`, `CHANGELOG.md`
