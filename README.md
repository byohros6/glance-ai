# Glance AI

**An always-on-top, non-intrusive workspace companion for AI assistants.**

Glance AI is a lightweight desktop heads-up display (HUD) that keeps your AI companion directly over your active workspace. Designed for developers, researchers, and creators who want instant AI assistance without the friction of constant `Alt + Tab` context switching or losing typing focus in their primary tools.

---

## Why Glance AI?

When you are deep in flow—writing code, debugging, analyzing data, or reviewing documents—switching windows breaks your concentration. Glance AI floats cleanly above your display as a lightweight, semi-transparent assistant that never interrupts your active work.

- **Zero Alt-Tab Friction**: Keep your AI companion right where you need it. Look up documentation, get architecture guidance, or review code snippets while keeping your eyes on your active editor.
- **Focus Mode (`Ctrl + F`)**: Interacting with or reading the overlay never steals active input focus or active typing cursors away from your IDE, terminal, or browser. No lost cursor positions, no redundant re-focus clicks.
- **Click-Through Mode (`Ctrl + M`)**: Allows mouse clicks to pass straight through the overlay to underlying windows, terminals, or documents without having to minimize or move the overlay.
- **Multi-Provider Architecture**: Seamlessly switch between Google Gemini, OpenAI ChatGPT, Anthropic Claude, and Perplexity from the Settings Dashboard.
- **Instant Workspace Capture (`Ctrl + S`)**: One keystroke captures your active screen workspace and cleanly attaches it to your AI companion alongside your custom prompt template.
- **Full Web Capabilities**: Directly connects with official web interfaces—giving you access to your full chat history, custom models, and project spaces using your existing accounts.
- **Silent Keyboard Navigation**: Reposition the overlay across your screen (`Ctrl + Arrows`), scroll conversation history (`Ctrl + Shift + Arrows`), adjust opacity (`Ctrl + [` / `]`), or toggle visibility (`Ctrl + H`) without touching your mouse.
- **Configuration Dashboard (`Ctrl + B`)**: Tailor default prompt templates, window dimensions, opacity presets, active AI provider, and custom hotkey bindings to match your preferred setup.

---

## Global Shortcuts

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| **`Ctrl + S`** | **Capture Workspace** | Captures active screen context and attaches it with your prompt |
| **`Ctrl + Enter`** | **Send Message** | Submits your query and workspace capture to your active AI companion |
| **`Ctrl + F`** | **Focus Mode** | Toggles non-intrusive focus (interacting won't steal focus from active apps) |
| **`Ctrl + M`** | **Click-Through Mode** | Passes mouse clicks through the overlay to underlying windows |
| **`Ctrl + H`** | **Toggle Visibility** | Silently hides or shows the overlay |
| **`Ctrl + B`** | **Dashboard Menu** | Opens the settings and keybinding configuration dashboard |
| **`Ctrl + ↑ / ↓ / ← / →`** | **Nudge Window** | Moves the overlay 40px in any direction across your display |
| **`Ctrl + Shift + ↑ / ↓`** | **Scroll History** | Scrolls companion conversation history up or down |
| **`Ctrl + [`** | **Decrease Opacity** | Dims overlay opacity by 10% (down to 15%) |
| **`Ctrl + ]`** | **Increase Opacity** | Increases overlay opacity by 10% (up to 100%) |
| **`Ctrl + Shift + Q`** | **Exit App** | Closes Glance AI immediately |

*All keybindings can be customized in the Settings Dashboard (`Ctrl + B`).*

---

## Quick Start

### 1. Pre-Built Binaries (Windows x64 — v1.2.0)
Download the latest pre-compiled binaries from the `dist/` directory or GitHub Releases:
- **Interactive Setup Wizard**: [`dist/Glance-AI-Setup-1.2.0.exe`](dist/Glance-AI-Setup-1.2.0.exe) (Recommended: interactive installation wizard with custom destination directory, shortcuts, and completion controls)
- **Standalone Portable**: [`dist/Glance-AI-Portable-1.2.0.exe`](dist/Glance-AI-Portable-1.2.0.exe) (Zero installation, cached directory unpacking)

### 2. Running from Source
Ensure you have [Node.js](https://nodejs.org/) installed:

```bash
# Clone the repository
git clone https://github.com/byohros6/glance-ai.git
cd glance-ai

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

Glance AI includes a built-in browser diagnostic tool to verify that the overlay preserves your active editor focus and passes clicks through properly:

- Double-click **`open-test-bench.bat`**, or
- Run `npm run test-bench`, or
- Open `tools/focus-tester/index.html` in Google Chrome.

The test bench provides real-time telemetry on window focus/blur events, click pass-through hit counters, and keystroke logging.

---

## Automated Test Suite

Run the full automated test suite covering store persistence, window interactions, shortcut management, and multi-provider routing:

```bash
npm test
```

---

## Architecture Overview

```
glance-ai/
├── src/                          # Application Source
│   ├── main/                     # Main process (window lifecycle, multi-provider routing, shortcuts)
│   ├── preload/                  # Sandboxed bridge & UI toolbar
│   └── renderer/                 # Glassmorphic settings dashboard
│
├── tools/                        # Developer & Diagnostic Utilities
│   └── focus-tester/             # Standalone browser event monitor
│
├── tests/                        # 4-Tier Automated Test Suite (21 Suites)
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
