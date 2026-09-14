# Project: UndecGPT (Undetectable Gemini Desktop Overlay)

## Architecture
UndecGPT is an undetectable desktop overlay for Google Gemini Web UI, achieving complete feature parity with WhisprGPT.
The architecture is structured across three core layers:

1. **Main Process (`src/main/`)**:
   - `main.js`: Lifecycle management, transparent borderless window creation, stealth window flags (`WS_EX_TOOLWINDOW` via `type: 'toolbar'`, `skipTaskbar`, `SetWindowDisplayAffinity` via `setContentProtection(true)`), single instance mutex, Google OAuth popup handler.
   - `shortcuts.js`: Global shortcut manager (`Ctrl+S`, `Ctrl+Enter`, `Ctrl+F`, `Ctrl+M`, `Ctrl+H`, `Ctrl+[`/`]`, `Ctrl+Shift+Q`, `Ctrl+Arrows`, `Ctrl+Shift+Arrows`). Orchestrates pre-roll hide delay, triggers screenshot capture, dispatches prompts.
   - `screenshot.js`: High-DPI screen capture engine. Primary screen targeting via `screen.getPrimaryDisplay()`, `desktopCapturer` with high-DPI scaling, PowerShell `CopyFromScreen` DPI-aware fallback.
   - `store.js`: Persistent JSON settings store (`undecgpt_settings.json` in `userData`) for geometry, opacity, focusable, clickThrough, and custom prompts.

2. **Preload & Injected Scripts (`src/preload/`)**:
   - `preload.js`: Context bridge (`window.undecgpt`, `window.upload`), security masking (`delete navigator.webdriver`, Chrome 132 UA headers), floating stealth toolbar injection, settings modal, toast notifications, hover click-through restoration (`mouseenter`/`mouseleave`).
   - Main-World Interceptor & DOM Injection Engine: Executes in Gemini page context. Implements 2-step trigger sequence (`[aria-label="Upload & tools"]` -> `[data-test-id="hidden-local-file-upload-button"]`), `HTMLInputElement.prototype.click` interceptor, direct `<input type="file">` fallback, and synthetic clipboard paste fallback. Handles prompt text insertion and message submit polling.

3. **Tooling & Test Infrastructure (`tests/`, `dist/`, build scripts)**:
   - Automated testing suite executed via `npm test` covering Tiers 1-4.
   - `electron-builder` configuration producing standalone portable Windows x64 executable in `dist/`.
   - Clean Git repository with `.gitignore` and comprehensive documentation.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Borderless & Transparent Canvas | Window without titlebars/chrome, alpha transparency | M1 | survey_spec #1 |
| 2 | Always-On-Top Z-Order | Pins overlay above standard windows (`screen-saver` level) | M1 | survey_spec #2 |
| 3 | Taskbar & Alt+Tab Exclusion | `WS_EX_TOOLWINDOW` via `type: 'toolbar'` + `setSkipTaskbar(true)` | M1 | survey_spec #3 |
| 4 | Screen-Share Invisibility | `setContentProtection(true)` -> `SetWindowDisplayAffinity` | M1 | survey_spec #4 |
| 5 | Window Geometry Persistence | Persist x, y, width, height in `undecgpt_settings.json` | M1 | survey_spec #5 |
| 6 | Dynamic Opacity Control | `Ctrl + [` / `]` and slider, clamped `[0.15, 1.0]` | M1 | survey_spec #6 |
| 7 | Single Instance Enforcement | `requestSingleInstanceLock` prevents duplicate processes | M1 | survey_spec #7 |
| 8 | Non-Activating Focus Mode | `WS_EX_NOACTIVATE` (`focusable: false`) toggle via `Ctrl + F` | M1 | survey_spec #8 |
| 9 | Click-Through Mode | `setIgnoreMouseEvents` toggle via `Ctrl + M` + top-bar hover | M1 | survey_spec #9 |
| 10 | Silent Keyboard Nudge | `Ctrl + Arrows` moves window in ±40px increments | M1 | survey_spec #10 |
| 11 | Chat History Silent Scroll | `Ctrl + Shift + Arrows` smooth scrolls Gemini chat container | M1 | survey_spec #11 |
| 12 | Boss Key (Quick Hide/Show) | `Ctrl + H` instantly toggles visibility | M1 | survey_spec #12 |
| 13 | Emergency Kill Switch | `Ctrl + Shift + Q` immediately terminates process | M1 | survey_spec #13 |
| 14 | Pre-Roll Hide Delay | 100ms compositor wait before capture prevents self-capture | M2 | survey_spec #14 |
| 15 | High-DPI Desktop Capture | Primary display scaleFactor capture + PowerShell fallback | M2 | survey_spec #15 |
| 16 | Separate Attach vs Send Flow | `Ctrl + S` attaches screenshot; `Ctrl + Enter` submits | M2 | survey_spec #16 |
| 17 | 2-Step Trigger Sequence | `[aria-label="Upload & tools"]` -> hidden upload button | M2 | survey_spec #17 |
| 18 | Monkey-Patch Click Interceptor | Intercepts file input `.click()` in main-world without dialog | M2 | survey_spec #18 |
| 19 | Direct `<input type="file">` Fallback | Scans DOM and populates File via DataTransfer | M2 | survey_spec #19 |
| 20 | Synthetic Clipboard Paste Fallback | Dispatches synthetic `paste` event with image to editor | M2 | survey_spec #20 |
| 21 | Prompt Text Injection | Injects custom prompt into Gemini Quill editor | M2 | survey_spec #21 |
| 22 | Message Submit Engine | Polls send button, retries, synthetic Enter fallback | M2 | survey_spec #22 |
| 23 | Chrome User-Agent Spoofing | Spoofs Chrome 132 on headers and webContents | M2 | survey_spec #23 |
| 24 | Webdriver Masking | Deletes `navigator.webdriver` to bypass bot checks | M2 | survey_spec #24 |
| 25 | Google OAuth Popup Handling | Dedicated interactive child window for `accounts.google.com` | M2 | survey_spec #25 |
| 26 | Floating Stealth Toolbar | Draggable header with quick action buttons & ghost badge | M1 | survey_spec #26 |
| 27 | Floating Toast Notifications | Status badges ("Attaching screenshot...", "Sent to Gemini") | M1 | survey_spec #27 |
| 28 | In-Overlay Settings Modal | Gear modal for prompt, focus mode, click-through toggles | M1 | survey_spec #28 |
| 29 | Settings Store Integrity | Corrupt JSON recovery, robust default fallbacks | M1 | survey_spec #29 |
| 30 | Automated Smoke & Window Flags Test | Headless Electron test verifying native window flags | M4 | survey_spec #30 |
| 31 | Comprehensive 4-Tier Test Suite | Tiers 1-4 automated test suite run via `npm test` | M4 | survey_spec #31 |
| 32 | Standalone Portable Windows .exe | `electron-builder` portable target in `dist/` + `build.bat` | M3 | survey_spec #32 |
| 33 | Clean Git Repository Setup | Git initialized, production `.gitignore`, clean commits | M3 | survey_spec #33 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Stealth Window & Native OS Integration | R1: `WS_EX_TOOLWINDOW` / `type: 'toolbar'`, `skipTaskbar`, `setContentProtection(true)`, Non-Activating Focus mode (`WS_EX_NOACTIVATE`), Click-Through mode + top-bar hover, geometry persistence, hotkeys | none | DONE |
| M2 | Gemini Screenshot Injection & Prompt Engine | R2: Pre-roll hide delay (100ms compositor wait), primary display high-DPI capture, eliminate double-injection race condition, main-world click interceptor, 2-step trigger sequence, paste fallbacks, `Ctrl+Enter`/`Return` submit engine, Google OAuth & anti-detection | M1 | IN_PROGRESS |
| M3 | Packaging, Build Scripts & Git Hygiene | R4: `electron-builder` config for portable `.exe` in `dist/`, `build.bat`, clean Git repo initialization, `.gitignore`, expanded `README.md` | none | PLANNED |
| M4 | Final E2E Test Pass & Adversarial Hardening | R3: Phase 1: Pass 100% of E2E test suite (Tiers 1-4). Phase 2: Adversarial Coverage Hardening (Tier 5) with Challenger stress testing | M1, M2, M3, E2E | PLANNED |
| E2E | E2E Testing Track (Parallel) | R3: Build comprehensive test harness and test suite (Tiers 1-4: Unit, Window Flags, DOM Injection, Resilience) and publish `TEST_READY.md` | none | DONE |

## Interface Contracts

### Main Process ↔ Preload (IPC Channels)
- `get-settings` (sync/invoke) -> returns `SettingsObject`
- `save-settings` (send, `newSettings`) -> updates `store.js`
- `set-ignore-mouse-events` (send, `ignore: boolean`, `options?: { forward: boolean }`) -> updates `mainWindow.setIgnoreMouseEvents`
- `set-focusable` (send, `focusable: boolean`) -> updates `mainWindow.setFocusable`
- `set-opacity` (send, `opacity: number`) -> updates `mainWindow.setOpacity` clamped `[0.15, 1.0]`
- `action:attach-screenshot` (send) -> triggers pre-roll hide, primary screen capture, and uploads image to Gemini
- `action:send-message` (send) -> triggers message submission in Gemini
- `action:show-toast` (send, `{ message: string, type?: 'info'|'success'|'warn'|'error' }`) -> renders UI toast
- `action:scroll` (send, `deltaY: number`) -> smooth scrolls Gemini chat container
- `action:toggle-focus` (send) -> toggles focus mode and updates UI

### Main Process ↔ Screenshot Module (`src/main/screenshot.js`)
- `captureScreen()` -> `Promise<string>` (resolves to Base64 PNG data URL)
  - Targets `screen.getPrimaryDisplay()`
  - Accounts for display `scaleFactor`
  - Fallback: PowerShell `System.Drawing.Graphics.CopyFromScreen` with `SetProcessDPIAware()`

### Preload / Main World ↔ Gemini Web Page
- 2-Step Trigger:
  1. Target: `button[aria-label="Upload & tools"], button[aria-label*="Upload"]`
  2. Target: `input[data-test-id="hidden-local-file-upload-button"], input[type="file"]`
- Main-World Click Interceptor:
  - Monkey-patches `HTMLInputElement.prototype.click` inside the page's execution world
  - Injects `File` into `input.files` via `DataTransfer`
  - Emits `input` and `change` events
  - Auto-restores original `.click` after 3500ms
- Direct Input Fallback: Scans `document.querySelectorAll('input[type="file"]')`
- Synthetic Paste Fallback: Dispatches `ClipboardEvent('paste')` to `.ql-editor`
- Submit Engine: Targets `button[aria-label="Send message"], button[aria-label*="Send"]`, retries 8x @ 200ms, falls back to Enter keydown on editor.

## Code Layout
```
c:\Users\benoy\OneDrive\Documents\UndecGPT\
├── .agents/
│   ├── orchestrator/          # Top-level orchestrator metadata
│   ├── sub_orch_m1/           # Sub-orchestrator Milestone 1
│   ├── sub_orch_m2/           # Sub-orchestrator Milestone 2
│   ├── sub_orch_m3/           # Sub-orchestrator Milestone 3
│   ├── sub_orch_m4/           # Sub-orchestrator Milestone 4 (Final)
│   └── sub_orch_e2e/          # Sub-orchestrator E2E Testing Track
├── src/
│   ├── main/
│   │   ├── main.js            # Electron main process & window management
│   │   ├── shortcuts.js       # Global shortcuts & action coordinator
│   │   ├── screenshot.js      # Primary display DPI-aware screen capture
│   │   └── store.js           # Settings persistence store
│   └── preload/
│       ├── preload.js         # Preload script, contextBridge, UI overlay
│       └── injected.js        # Main-world script for DOM injection & click interceptor
├── tests/                     # Automated test suite (Tiers 1-4)
│   ├── unit/                  # Tier 1: Store, settings, geometry logic
│   ├── window/                # Tier 2: Window flags, stealth, shortcuts
│   ├── injection/             # Tier 3: DOM injection, interceptor, fallbacks
│   └── e2e/                   # Tier 4: Full resilience & capture integration
├── dist/                      # Packaged standalone portable .exe
├── package.json               # Scripts, electron-builder config
├── build.bat                  # Standalone Windows build script
├── README.md                  # Comprehensive project documentation
└── .gitignore                 # Production gitignore
```
