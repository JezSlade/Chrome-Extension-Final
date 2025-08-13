# Test Plan

## Load and CSP
1. Load unpacked in Chrome. Open popup and options.
2. Confirm no CSP errors in DevTools console.

## Sync and State
1. Change a setting. Close options. Reopen. Verify persistence.
2. Install on a second Chrome profile if available. Verify sync of changes.

## Cues and Variables
1. Add cue `:hello` with template `Hello {{date:%Y-%m-%d}}`.
2. Type `:hello` in a textarea on any site. Expect the expansion.
3. Add a variable `company` type text default "Acme". Use `{{company}}` in a cue and verify output.

## Import and Export
1. Export JSON, then wipe cues, then import and confirm restoration.

## ContentEditable
1. Test in a rich editor with `contentEditable` like a comment box. Verify expansion.
