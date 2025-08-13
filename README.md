# ToolForge

Text expansion for the browser with synced cues and variables.

## Highlights
- Mission critical sync via `chrome.storage.sync`
- Strict MV3 CSP with zero inline JS
- Minimal popup focused on sync status
- Full Options page to manage settings, cues, and variables
- Content script replaces triggers like `:sig` in inputs and contentEditable areas
- Import and Export JSON aligned to schema

## Install
1. Download the ZIP from ChatGPT.
2. Unzip.
3. In Chrome go to `chrome://extensions`.
4. Enable Developer mode.
5. Click Load unpacked and choose the unzipped folder.

## Usage
- Click the extension icon to open the popup and check sync status.
- Open Options to add or edit cues and variables.
- Type a trigger like `:sig` in an input and the replacement will insert automatically.

## CSP and Security
- No inline script on any page.
- `content_security_policy.extension_pages` forbids inline and allows only self scripts.
- No eval or dynamic code strings for injection. All scripting uses files.
