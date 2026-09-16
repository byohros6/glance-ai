# Original User Request

## Initial Request — 2026-09-14T20:22:52Z

A balanced, medium-sized team: Ensure UndecGPT achieves complete feature parity with WhisprGPT as an undetectable Gemini overlay, thoroughly test all edge cases and workflows, package it into a portable standalone Windows executable (.exe), and initialize a clean Git repository with maintainable architecture, high code standards, and secure dependencies.

Working directory: c:\Users\benoy\OneDrive\Documents\UndecGPT
Integrity mode: development

## Requirements

### R1. Complete WhisprGPT Feature Parity & Stealth Window
- The application window must be transparent, borderless, always-on-top, and completely hidden from the Windows taskbar and Alt+Tab (WS_EX_TOOLWINDOW / type: 'toolbar').
- The window must be shielded from desktop screen-sharing and screen-recording tools via native window display affinity (setContentProtection(true)).
- The overlay must have no bottom bars or taskbar indicators.
- Non-Activating Focus Mode: Support toggling between interactive focus and non-activating mode (WS_EX_NOACTIVATE) so clicking the overlay never steals keyboard focus from background editors or games.
- Click-Through Mode: Support toggling click-through mode (setIgnoreMouseEvents(true, { forward: true })) so mouse clicks pass through to underlying windows while hovering the top bar preserves controls.

### R2. Rock-Solid Gemini Screenshot Injection & Prompt Dispatch
- Ctrl + S: Smoothly hides the overlay before capture (pre-roll delay) so it never captures itself, takes a full-resolution primary screen screenshot with high-DPI awareness, and attaches the screenshot thumbnail card inside Gemini's prompt bar without submitting.
- Ctrl + Enter (and Ctrl + Return): Dispatches the message to Gemini.
- Reliable DOM injection utilizing WhisprGPT's 2-step trigger sequence ([aria-label="Upload & tools"] -> [data-test-id="hidden-local-file-upload-button"]) with an HTMLInputElement.prototype.click interceptor, plus direct <input type="file"> injection and synthetic paste fallbacks.

### R3. Edge-Case Hardening & Automated Testing Suite
- Implement a comprehensive automated test suite verifying:
  - Settings persistence and default values.
  - Window flags (type: 'toolbar', skipTaskbar, contentProtection, focusable, ignoreMouseEvents).
  - Global shortcut registrations and event dispatching.
  - High-DPI screenshot capture and base64 generation.
  - Preload script syntax, DOM query robustness, and error handling.
- Gracefully handle network interruptions, Google login transitions, and DOM selector updates. Ensure all third-party code is secure, clean, and free of vulnerabilities.

### R4. Portable Executable Packaging & Repository Initialization
- Configure build tools (e.g. electron-builder) with a clear build script (npm run dist / build.bat) to produce a single portable .exe in dist/ that runs out of the box without requiring local Node.js or npm.
- Initialize a clean Git repository with appropriate .gitignore (ignoring node_modules, dist, temp files), an informative README.md, and clean initial commits.

## Acceptance Criteria

### Stealth & Window Quality
- [ ] Application produces zero taskbar icons, buttons, or running indicator bars in Windows.
- [ ] Application does not appear in the Windows Alt+Tab switcher.
- [ ] Application is excluded from OBS, Discord, and Zoom screen shares.
- [ ] When Focus mode is OFF (Ctrl + F), clicking anywhere on UndecGPT does not steal keyboard focus from the user's active application.
- [ ] When Click-Through mode is ON (Ctrl + M), mouse clicks pass directly through to windows beneath.

### Gemini Automation
- [ ] Pressing Ctrl + S captures the primary screen without capturing the overlay and attaches the screenshot image to Gemini's input bar.
- [ ] Pressing Ctrl + S does NOT automatically submit the prompt.
- [ ] Pressing Ctrl + Enter submits the message to Gemini.

### Build, Tests, and Maintenance
- [ ] Automated test suite runs and passes cleanly via npm test.
- [ ] Packaging script generates a standalone portable Windows .exe that launches and functions independently.
- [ ] Git repository is initialized with clean commit history and proper .gitignore.

## Follow-up — 2026-09-15T17:22:13Z

Refactor and rebrand the desktop overlay into a clean, multi-provider AI desktop companion (supporting Google Gemini, OpenAI ChatGPT, Anthropic Claude, and Perplexity) named **Glance** (repo: `glance-desktop`), with minimal typography (no emoji clutter), literal "Focus Mode" and "Click-Through Mode" naming, and a unified provider selector.

Working directory: `C:\Users\benoy\OneDrive\Documents\UndecGPT`

## Requirements

### R1. Clean Naming & Minimalist UI Styling
- Revert all "Ghost Mode" naming to standard, literal **"Click-Through Mode"**.
- Standardize **"Focus Mode"** across the dashboard, toolbar, settings, and toast notifications.
- Remove emoji clutter from UI buttons, toolbar badges, and notifications across `dashboard.html`, `dashboard.js`, `preload.cjs`, `preload.js`, and `README.md`.
- Name the application **Glance** (repository: `glance-desktop`).

### R2. Multi-LLM Provider Architecture
- Expand the core window navigation and session engine to support multiple web AI providers:
  - Google Gemini (`https://gemini.google.com/app`)
  - OpenAI ChatGPT (`https://chatgpt.com/`)
  - Anthropic Claude (`https://claude.ai/`)
  - Perplexity (`https://www.perplexity.ai/`)
- In `store.js`, add `provider` setting defaulting to `'gemini'`.
- In `dashboard.html` / `dashboard.js`, add an active provider selector allowing users to switch their companion AI.
- In `main.js`, load the appropriate URL based on the selected provider when launching the overlay.
- Keep session management clean and consistent with uniform Chrome User-Agent across all providers.

### R3. Repository Branding & Documentation
- Update `package.json` with `name: "glance"`, `productName: "Glance"`, `artifactName: "Glance-Portable.exe"`.
- Update `README.md` to present Glance as a multi-model workspace HUD.

## Acceptance Criteria

### Interaction & UI
- [ ] Toolbar and Dashboard display "Focus Mode" and "Click-Through Mode" with zero "ghost mode" references.
- [ ] Emojis removed from major UI action buttons and badges.
- [ ] Dashboard includes a clean provider selector dropdown/tabs for Gemini, ChatGPT, Claude, and Perplexity.
- [ ] Switching providers updates the target overlay URL in store and launches the selected AI web app.

### Verification & Tests
- [ ] All automated test suites continue to pass cleanly (`npm test`).
- [ ] Portable binary compiles cleanly as `Glance-Portable.exe`.

## Follow-up — 2026-09-15T17:25:11Z

User feedback on naming: The user prefers "Glance AI" (repository: "glance-ai", productName: "Glance AI", binary: "Glance-AI-Portable.exe"). Please ensure this exact branding is reflected across package.json, the dashboard title, README, and the compiled executable.

## Follow-up — 2026-09-15T19:03:19Z

This is a single self-contained implementation and validation task; keep it small and focused.

Extend Glance AI's screenshot capture, prompt injection, and submit automation to support OpenAI ChatGPT, Anthropic Claude, and Perplexity AI in addition to Google Gemini, with robust fallback strategies and complete end-to-end verification.

Working directory: c:\Users\benoy\OneDrive\Documents\UndecGPT
Integrity mode: development

## Requirements

### R1. Multi-Provider DOM Ingestion & Injection Engine
- Enhance src/preload/preload.cjs and src/preload/preload.js so that when Ctrl + S (workspace capture) is triggered:
  - Detects the active provider domain (gemini.google.com, chatgpt.com, claude.ai, perplexity.ai).
  - Implements provider-tailored file upload strategies:
    - ChatGPT: Intercept/trigger file upload or paste image blob directly into div[contenteditable="true"]#prompt-textarea / textarea.
    - Claude: Paste image dataTransfer or attach via input file elements / div[contenteditable="true"].
    - Perplexity: Inject image into file upload input or file dropzone.
    - Universal Fallback: Synthesize clipboard paste event (new ClipboardEvent('paste')) with standard PNG file blob on whichever active contenteditable or textarea currently has focus.

### R2. Prompt Injection & Message Submission Across Providers
- Inject the user's default prompt into the active provider's input container:
  - ChatGPT: Update text in contenteditable/textarea and trigger input events so the React send button is activated.
  - Claude: Insert text into ProseMirror/contenteditable container with dispatch event.
  - Perplexity: Update query textarea.
- Implement automated submit (Ctrl + Enter or autoSubmit toggle):
  - Click the respective provider send button ([data-testid="send-button"], button[aria-label="Send Message"], etc.) with fallback to synthetic Enter keydown.

### R3. Quality Assurance, Test Coverage & Packaging
- Add automated test coverage in tests/ verifying provider detection, selector resolution, and fallback paste mechanics across all 4 supported providers.
- Maintain 100% pass rate across all existing 20 test suites (npm test).
- Ensure npm run dist / build.bat packages cleanly into dist/Glance-AI-Portable.exe.

## Acceptance Criteria

### Provider Support
- [ ] Screenshot injection (Ctrl + S) successfully attaches the captured image on ChatGPT, Claude, and Perplexity (or falls back cleanly via synthetic clipboard paste).
- [ ] Prompt injection properly populates the input field without breaking React/ProseMirror internal state.
- [ ] Submit trigger (Ctrl + Enter) reliably fires the send button across all supported providers.

### Reliability & Verification
- [ ] All unit and integration test suites pass (npm test).
- [ ] New provider detection and fallback tests pass cleanly.
- [ ] Standalone portable binary (Glance-AI-Portable.exe) builds without errors.
- [ ] Changes committed and pushed to main at https://github.com/byohros6/glance-ai.git.
## 2026-09-16T06:22:13Z

This is a single self-contained publication audit and validation task; keep it small and focused.

Conduct a comprehensive publication-readiness audit of Glance AI v1.1.0 covering 100% automated functional testing, edge-case verification, visual UI rendering and screenshot capture of all primary application screens (Settings Dashboard, standard & narrow overlay toolbars, Hotkeys sheet), code quality inspection, dependency cleanliness, file structure hygiene, and git repository status.

Working directory: `c:\Users\benoy\OneDrive\Documents\UndecGPT`
Integrity mode: development

## Requirements

### R1. Functional & Edge-Case Verification
- Run the full 21-suite automated test suite (`npm test`) across Tiers 1–4 and confirm zero failures.
- Verify key edge cases:
  - Multi-provider DOM injection & universal synthetic paste fallback across Gemini, ChatGPT, Claude, and Perplexity.
  - Non-intrusive focus mode (`Ctrl + F`) and click-through mode (`Ctrl + M`).
  - Corrupt store recovery and off-screen window coordinate boundary clamping.
  - High-DPI screenshot capture and single-instance mutex enforcement.

### R2. Visual UI Inspection & Screen Renderings
- Programmatically launch and capture high-resolution screenshots of the application interfaces:
  1. The **Settings Dashboard** (`src/renderer/dashboard.html`) showing clean branding (no redundant top version pill), auto-save footer, and clear Focus Mode descriptions.
  2. The **Injected Floating Toolbar** in standard overlay view (`520px` width) showing clean branding (no green HUD badge), compact action buttons, and hotkeys button.
  3. The **Injected Floating Toolbar in narrow view** (`360px` width) verifying zero button overflow, automatic brand text collapsing, and full accessibility of right-hand controls.
  4. The **Keyboard Shortcuts (Hotkeys) Modal** demonstrating the shortcut cheat sheet and navigation.
- Embed or catalog the visual screenshots in a structured walkthrough/report.

### R3. Code Quality, File Tree & Dependency Cleanliness
- Audit source files for syntax cleanliness, leftover console debug statements, and deprecated naming.
- Confirm `src/preload/preload.js` and `src/preload/preload.cjs` are synchronized.
- Ensure no orphaned test scripts, temporary scratch files, or deprecated binaries exist in the root or `dist/` folders.
- Audit `package.json` for proper metadata (name `glance-ai`, version `1.1.0`, scripts, repository, keywords).

### R4. Release Packaging & Git Hygiene
- Confirm `dist/Glance-AI-Setup-1.1.0.exe` and `dist/Glance-AI-Portable.exe` are present, correctly sized, and built without errors.
- Confirm `build.bat` and `open-test-bench.bat` operate cleanly.
- Verify `git status` is clean, all changes are committed with clear conventional commit messages, and the remote repository (`https://github.com/byohros6/glance-ai.git`) on `main` is up to date.

## Acceptance Criteria

### Testing & Reliability
- [ ] All 21 test suites pass with 0 failures (`npm test`).
- [ ] No unhandled exceptions or console errors across main, preload, or renderer.

### Visual & UX Standards
- [ ] Visual screenshots of the Dashboard, standard toolbar, narrow toolbar (no overflow), and Hotkeys modal captured and saved.
- [ ] Top bar header does not obscure Gemini model selectors or web navigation.
- [ ] Focus mode description and toggle state match expected behavior.

### Code & Repository Hygiene
- [ ] Zero deprecated UndecGPT binaries or obsolete artifacts in the distribution tree.
- [ ] Git repository clean, fully committed, and synchronized to remote main branch.
- [ ] Both 1-click installer and optimized portable binaries verified.
