
# ToolForge — Personal Cross-Device Sync & Cue Management Suite

## Overview
ToolForge is a personal, modular productivity extension designed to synchronize your private tools and configurations across devices. It is **not** a public Chrome Extension marketplace tool; it is built for your personal workflow and securely manages synced data between environments. The first implemented feature is **Cues** (formerly called Expansions). Cues allow you to create, manage, and insert dynamic text expansions with triggers, embedded form elements, and AI prompt elements — all configurable via a streamlined UI.

## Core Features

### 1. Cross-Device Sync
- **Chrome Storage Sync** is used to persist data across devices where your Chrome profile is signed in.
- All configuration data, including Cues, Variables, Form Elements, and AI Prompt Elements, are synced to your profile.
- Data **remains available after extension reload** unless Chrome Sync is disabled.
- Data can be exported and imported manually for backup and restore.

### 2. Cues
- **Cues** are text expansions triggered by a specific keyword or sequence, e.g., `:greet` → "Hello, how are you today?"
- Each Cue has:
  - A **Trigger** (required, unique)
  - A **Body** (the expanded content)
  - Formatting via a rich toolbar:
    - **Text Formatting** (bold, italic, underline, etc.)
    - **Form Element Insertion** (configurable inputs, dropdowns, date pickers, etc.)
    - **AI Prompt Element Insertion** (configurable prompts for automated text generation)
- Elements are inserted inline with icons representing them and can be edited via modal configuration dialogs.

### 3. Element Configuration
- The **Element Configuration** area is where you manage the reusable components:
  - **Variables** — simple reusable placeholders that store dynamic values.
  - **Form Elements** — interactive UI components to collect input at expansion time.
  - **AI Prompt Elements** — preconfigured AI prompt templates for dynamic responses.
- Each element type supports full CRUD (Create, Read, Update, Delete).
- All elements are available for insertion into Cues.

### 4. Modular Architecture
- Cues are **just one part** of ToolForge; more tools will be added without disrupting existing functionality.
- Codebase adheres to DRY principles — no redundant logic unless absolutely necessary.
- Element handling (Variables, Forms, AI Prompts) shares a common configuration system.

### 5. Form Pipeline as Wizard
- Form creation/editing is handled through a step-by-step **wizard** rather than static drag-and-drop.
- Wizard prompts the user to configure:
  1. Element type
  2. Label / placeholder text
  3. Options (if applicable)
  4. Required/optional settings
- Inserts directly into Cues during configuration.

## Technical Details

### Data Persistence
- **Chrome Sync** is the primary storage layer.
- Data persists even if the extension is offloaded and reloaded, as long as you are signed into Chrome Sync.
- Disabling Chrome Sync or clearing storage will remove data.

### File Structure
- `/background/` — Background scripts for sync and messaging.
- `/content/` — Content scripts injected into editable fields.
- `/popup/` — Main UI for managing Cues and configuration.
- `/options/` — Full settings and library management.
- `/shared/` — Reusable logic (storage handlers, element managers, utilities).

### DRY Implementation
- All CRUD pages (Cues, Variables, Forms, AI Prompts) share common storage and form-handling modules.
- UI components are reused wherever possible, with only type-specific logic injected.

## Testing & Validation
- Test Cue creation, editing, and trigger expansion across devices to verify sync.
- Test insertion of Form and AI Prompt Elements inside Cue bodies.
- Validate that Element Configuration updates propagate to all Cues using those elements.

## Future Expansion
ToolForge is designed to be a private productivity suite with multiple tools:
- **Cues** — Already implemented.
- **Snippet Library** — Centralized management of reusable text/code blocks.
- **Workflow Macros** — Automations triggered by hotkeys or events.
- **Data Dashboards** — Real-time stats and monitoring.

---
**Author:** Jez Slade  
**License:** Private Use Only — Not for Redistribution
