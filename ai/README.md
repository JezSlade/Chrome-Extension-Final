# ⚡ ToolForge - Text Expansion for Chrome

A beautiful, minimal text expansion Chrome extension that syncs across all your Chrome instances. Like Espanso, but for your browser.

## ✨ Features

- **Lightning Fast**: Instant text expansion as you type
- **Chrome Sync**: Automatically syncs between all your Chrome browsers (home, work, school)
- **Beautiful UI**: Modern, glassmorphism design with smooth animations
- **Full CRUD**: Create, Read, Update, Delete expansions with ease
- **Smart Search**: Quickly find expansions with real-time filtering
- **Universal Support**: Works on all websites, input fields, and content-editable areas

## 🚀 Installation

### Option 1: Load as Unpacked Extension (Development)

1. Download or clone all the extension files
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked" and select the folder containing the extension files
5. The ToolForge icon should appear in your extensions toolbar

### Option 2: Create Extension Package

1. Zip all the files together
2. Rename the zip file to have a `.crx` extension
3. Drag and drop into Chrome extensions page

## 🎯 Usage

### Adding Expansions

1. Click the ToolForge icon in your toolbar
2. Enter a **cue** (trigger) starting with `:` (e.g., `:email`)
3. Enter the **expansion text** (e.g., `john@example.com`)
4. Click "Add Expansion"

### Using Expansions

Simply type your cue followed by a space or tab in any text field:

```
:email → john@example.com
:sig → Best regards,
       John Smith
:phone → +1 (555) 123-4567
```

### Managing Expansions

- **Search**: Use the search box to quickly find expansions
- **Edit**: Click "Edit" on any expansion to modify it
- **Delete**: Click "Delete" to remove expansions
- **Auto-sync**: Changes automatically sync across all Chrome instances

## 📁 File Structure

```
toolforge/
├── manifest.json          # Extension configuration
├── popup.html             # Extension popup interface
├── popup.js               # Popup logic and UI management
├── content.js             # Text expansion engine
├── background.js          # Background service worker
├── icon16.png             # 16x16 extension icon
├── icon48.png             # 48x48 extension icon
├── icon128.png            # 128x128 extension icon
└── README.md              # This file
```

## 🛠️ Technical Details

### Architecture

- **Manifest V3**: Uses the latest Chrome extension architecture
- **Chrome Sync**: Leverages Chrome's built-in sync storage
- **Content Script**: Monitors all text inputs across websites
- **Service Worker**: Handles background sync and messaging

### Permissions

- `storage` - Store and sync expansion data
- `activeTab` - Access current tab for text expansion
- `scripting` - Inject content script into web pages

### Storage

- **Sync Storage**: Expansion data synced across Chrome instances
- **Local Storage**: Optional usage statistics (privacy-focused)

## 🎨 Customization

The extension uses a modern glassmorphism design with:
- Gradient backgrounds
- Backdrop blur effects
- Smooth animations
- Responsive hover states

CSS can be customized in the `<style>` section of `popup.html`.

## 🔧 Development

### Adding New Features

1. **New expansion types**: Modify the expansion object structure
2. **Enhanced UI**: Update popup.html and styles
3. **Better matching**: Improve the text replacement algorithm in content.js

### Debugging

1. Open `chrome://extensions/`
2. Find ToolForge and click "Inspect views: background page"
3. Use browser developer tools to debug popup and content scripts

## 🤝 Default Expansions

ToolForge comes with helpful defaults:

- `:email` → your@email.com
- `:phone` → +1 (555) 123-4567
- `:sig` → Best regards,\nYour Name
- `:thanks` → Thank you for your time and consideration.

## 📱 Compatibility

- **Chrome**: Version 88+
- **Edge**: Chromium-based Edge
- **Brave**: Latest version
- **Other Chromium browsers**: Should work with Manifest V3 support

## 🔒 Privacy

- All data stays within Chrome's sync storage
- No external servers or tracking
- No analytics or user data collection
- Works completely offline

## 📄 License

This extension is provided as-is for personal and commercial use. Feel free to modify and distribute.

---

**Made with ❤️ for power users who love efficiency**