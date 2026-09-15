# Undec ⚡

**An always-on-top, non-intrusive workspace companion for Google Gemini.**

Undec is a lightweight desktop heads-up display (HUD) that keeps Google Gemini directly over your active workspace. Designed for developers, researchers, and creators who want instant AI assistance without the friction of constant `Alt + Tab` context switching or losing window focus.

---

## Why Undec?

When you're deep in your workflow—writing code, debugging, analyzing data, or reviewing designs—switching windows interrupts your momentum. Undec floats directly above your screen as a lightweight, semi-transparent assistant that never gets in your way.

- **Zero Alt-Tab Friction**: Gemini stays right where you need it. Check documentation, get architecture feedback, or review code snippets while keeping your eyes on your primary editor.
- **Non-Intrusive Focus (`Ctrl + F`)**: Interacting with or reading the overlay never steals active input focus or active typing cursors away from your IDE, terminal, or browser. No lost cursor positions, no redundant re-focus clicks.
- **Ghost Mode (`Ctrl + M`)**: Toggle click-through transparency to interact directly with the windows, terminals, or tools underneath the overlay without having to minimize it.
- **Instant Workspace Capture (`Ctrl + S`)**: One keystroke captures your active screen workspace and cleanly attaches it to Gemini alongside your custom context prompt.
- **Full Gemini Web Capabilities**: Directly embeds the official Google Gemini interface—access your full chat history, custom Gems, Gemini Advanced models, and code execution using your own Google account.
- **Silent Keyboard Navigation**: Reposition the overlay across your screen (`Ctrl + Arrows`), scroll chat history (`Ctrl + Shift + Arrows`), adjust opacity (`Ctrl + [` / `]`), or toggle visibility (`Ctrl + H`) without touching your mouse.
- **Customization Dashboard (`Ctrl + B`)**: Tailor default prompt templates, dimensions, transparency presets, and custom hotkey bindings to match your preferred desk setup.

---

## Global Shortcuts

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| **`Ctrl + S`** | **Capture Workspace** | Captures active screen context and attaches it to Gemini with your prompt |
| **`Ctrl + Enter`** | **Send Message** | Sends your query and workspace capture to Gemini |
| **`Ctrl + F`** | **Non-Intrusive Focus** | Toggles non-activating mode (interacting won't steal focus from other apps) |
| **`Ctrl + M`** | **Ghost Mode** | Passes mouse clicks through the overlay to underlying windows |
| **`Ctrl + H`** | **Toggle Visibility** | Silently hides or shows the overlay |
| **`Ctrl + B`** | **Dashboard Menu** | Opens the settings and keybinding configuration dashboard |
| **`Ctrl + ↑ / ↓ / ← / →`** | **Nudge Window** | Moves the overlay 40px in any direction across your display |
| **`Ctrl + Shift + ↑ / ↓`** | **Scroll History** | Scrolls Gemini conversation history up or down |
| **`Ctrl + [`** | **Decrease Opacity** | Dims overlay opacity by 10% (down to 15%) |
| **`Ctrl + ]`** | **Increase Opacity** | Increases overlay opacity by 10% (up to 100%) |
| **`Ctrl + Shift + Q`** | **Exit App** | Closes Undec immediately |

*All keybindings can be customized in the Settings Dashboard (`Ctrl + B`).*

---

## Quick Start

### 1. Standalone Portable Executable (Recommended)
No installation or runtime dependencies required. Download and run:
```
dist/UndecGPT-Portable.exe
```

### 2. Running from Source
Ensure you have [Node.js](https://nodejs.org/) installed:

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/UndecGPT.git
cd UndecGPT

# Install dependencies
npm install

# Start in development mode
npm start
```
*(Or double-click `run.bat`)*

### 3. Building Your Own Executable
To package a standalone `.exe` for Windows:
```bash
npm run dist
```
*(Or double-click `build.bat`)*

---

## Workspace Event Test Bench

Undec includes a built-in browser diagnostic tool to verify that the overlay preserves your active editor focus and passes clicks through properly:

- Double-click **`open-test-bench.bat`**, or
- Run `npm run test-bench`, or
- Open `tools/focus-tester/index.html` in Google Chrome.

The test bench provides real-time telemetry on window focus/blur events, click pass-through hit counters, and keystroke logging.

---

## Automated Test Suite

Run the full automated test suite covering store persistence, window interactions, shortcut management, and OAuth routing:

```bash
npm test
```

---

## Architecture Overview

```
UndecGPT/
├── src/                          # Application Source
│   ├── main/                     # Main process (window lifecycle, shortcuts, capture)
│   ├── preload/                  # Sandboxed bridge & UI toolbar
│   └── renderer/                 # Glassmorphic settings dashboard
│
├── tools/                        # Developer & Diagnostic Utilities
│   └── focus-tester/             # Standalone browser event monitor
│
├── tests/                        # 4-Tier Automated Test Suite (20 Suites)
│   ├── unit/                     # Store, DPI, and math tests
│   ├── window/                   # Window flags, shortcuts, OAuth routing tests
│   ├── injection/                # DOM upload sequence & submit engine tests
│   └── e2e/                      # Simulated workflow end-to-end test
│
├── open-test-bench.bat           # 1-Click launcher for browser test bench
├── run.bat                       # 1-Click launcher for development
├── build.bat                     # 1-Click build script for portable executable
└── package.json                  # Project manifest and build configuration
```

---

## License

MIT License. Free and open source for personal and commercial productivity.
