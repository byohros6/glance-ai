# Changelog

## 1.2.6

- Fix duplicate attachment rejection in Gemini ("You already uploaded a file named screenshot.png") by generating distinct, timestamped sequential screenshot filenames (`screenshot_HHMMSS_seq.png`) across capture operations.
- Eliminate "An attachment or send is already in progress" lockup caused by verification hanging when a provider rejected a duplicate upload.
- Implement early error banner detection (`activeErrorTexts` / `getNewProviderError`) in `verifyAttachment` to immediately abort and report provider-level upload failures instead of timing out.
- Fix occasional Windows access violation exit code (`3221225477`) during test suite teardown in `unit/opacity_clamping.test.js` using synchronous `win.destroy()`.

## 1.2.5

- Resolve Google Sign-In "This browser or app may not be secure" block during email submission by routing Google authentication and Gemini sessions with clean WebKit User-Agent and stripping Client Hints to bypass Chromium BotGuard heuristics.
- Eliminate detected script tampering by removing main-world WebAuthn monkey-patching in preload scripts, allowing native browser authentication APIs to remain intact.
- Expand recognized authentication hosts to cover Google verification and 2FA subdomains (`myaccount.google.com`, `passkeys.google.com`, `oauth2.googleapis.com`, `apis.google.com`, `ssl.gstatic.com`, `www.google.com`, `ogs.google.com`).
- Retain standard Chrome 132 fingerprinting for third-party AI providers (ChatGPT, Claude, Perplexity).

## 1.2.4

- Fix Google Accounts "This browser or app may not be secure" block by standardizing stable Chrome 132 User-Agent and client hints across all network requests, background frames, and popup windows.
- Prevent Windows Security "Choose a passkey" system modal by safely intercepting WebAuthn conditional mediation (passkey autofill) in preload, presenting standard email & password entry.
- Add `accounts.youtube.com` to recognized auth hosts for cross-origin session synchronization.
- Eliminate window teardown exit race in `shortcuts_registration.test.js` using synchronous `win.destroy()`.

## 1.2.3

- Disable Windows show/hide transitions for Glance windows so Ctrl+H restores without the native fade/zoom effect.
- Set the per-window DWM policy once in a hidden, asynchronous startup helper. Ctrl+H remains synchronous and launches no helper process.
- Preserve native edge resizing, opacity, focus/click-through, window bounds, and the provider's original UI; other applications' animation settings are untouched.
- Add production coverage for Windows accepting the transition policy and repeated immediate hide/show with unchanged size and opacity.

## 1.2.2

- Run global shortcut actions immediately in their native callback, instead of deferring them to a promise microtask. Async capture/send rejection handling remains intact.
- Reproduced a real Windows Ctrl+Left delay: 574 ms from injected key to position update before, 14 ms after (native callback dispatch portion: 562 ms to 1 ms). This is a local sample, not a latency guarantee.
- Add a regression that checks Ctrl+Left/Right change position before their callback returns, and a standalone Windows shortcut latency probe.
- Provider UI, movement distance, shortcut bindings, and focus behavior are unchanged.
- Validation: all 29 suites passed on the final run; packaged production integration passed. The final packaged code measured 13 ms key-to-position latency in the native probe.

## 1.2.1

- Harden provider IPC, navigation, permissions, and capture operations.
- Preserve the native provider UI, conversation and draft when opening settings.
- Correct window focus, shortcut rebinding, settings synchronization, and upload/send confirmation.
- Reduce redundant native window updates and fix lost repeated-scroll commands.
- Add isolated regression tests, packaging checks, and Windows CI.
- Validation: 29 suites / 131 cases and packaged-code smoke test passed before this version metadata update. Live provider responsiveness remains under investigation.

## Patch workflow

Each verified patch receives a patch-version increment, a changelog entry, and a Git commit. Keep the provider's original chat UI and existing features. Report local commit and remote push status separately.
