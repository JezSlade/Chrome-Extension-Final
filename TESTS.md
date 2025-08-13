# Tests 0.3.0

- Open Settings and verify theme contrast and dropdown colors.
- Navigate to Library pages. Search filters list. Toggle Cue enabled in Cues Library persists.
- Variables CRUD:
  - Add variable. Change id. Duplicate id should be blocked.
  - Change type via dropdown. Persist and reload page. Expect value retained.
  - Change default and label. Reload and confirm.
  - Delete variable. Reload and confirm removed.
- Cues CRUD:
  - Add cue. Edit trigger and template. Duplicate trigger blocked.
  - Toggle enabled via checkbox. Confirm in Cues Library.
- Content script:
  - Create cue :hello with template "Hello {{date:%Y-%m-%d}}". Type in a textarea and trigger expansion.
