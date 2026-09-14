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
