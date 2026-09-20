# Reliability and security fixes — 19 September 2026

The review's principal defects have been addressed in the application and its test infrastructure. The four providers, primary-display capture, prompt presets, optional auto-submit, toolbar, shortcut defaults, window sizing, opacity, focus mode, click-through, and capture-exclusion option remain available.

The overlay still displays the selected provider's original website and native chat interface. No replacement chat interface was introduced. Screenshots showing mock sessions are isolated test fixtures, not the product's provider UI.

## Changes

- Remote provider pages no longer receive a JavaScript API for screen capture, settings, or desktop controls. Privileged IPC validates the known window, main frame, and allowed URL. Authentication popups use a separate capability-free preload; URL checks use exact hosts. Provider microphone, camera, notification, and clipboard-read permissions require consent, with grants scoped to the provider and media type.
- Capture and send now share one bounded operation across main process and renderer. Navigation cancels pending work. Attachment success requires an observed preview; send success requires an observed submission transition. Disabled send buttons are respected. An ambiguous paste is not followed by a second potentially duplicate upload. Existing draft text survives prompt insertion.
- Settings and the conversation occupy separate windows. Returning to settings preserves the conversation URL and draft. Focus and click-through never disable the dashboard. Ctrl+B has one owner and saves pending dashboard edits before launching. The dashboard reflects shortcut changes to overlay state.
- Window state is applied consistently for hide/show, second-instance activation, capture completion, and focus changes. Disabling typing releases an already-focused Windows overlay. Bounds remain within a display work area and recover when displays change.
- Shortcut aliases and collisions are validated. Rebinding removes the old key. Registration failures restore prior bindings and are displayed. A recording timeout prevents shortcuts remaining disabled indefinitely.
- Screen capture remains primary-display capture, including the Windows fallback. Wrong-display fallback selection was removed, fallback execution is bounded, and cleanup releases capture locks even when restoration fails.
- One canonical preload replaces duplicate implementations and unused injection code. Test-only bridges require an explicit test argument and local fixture URL. Hidden test controls were removed from the product UI.
- Settings edits are batched, writes use atomic replacement, and failed saves are surfaced. The dashboard has a Content Security Policy. Documentation now states actual limitations instead of claiming complete coverage or guaranteed invisibility.
- The test runner discovers all suites, isolates settings, requires structured results and a successful process exit, and fails on crashes, timeouts, and incomplete output. Windows CI and a build script that stops on failures were added.

## Verification

- Syntax checks: passed (`npm run check`).
- Complete final regression run: **29/29 suites, 130 test cases passed**.
- Final packaged application archive: **production integration suite passed**, including dashboard synchronization, draft retention, IPC boundaries, shortcut rollback, toolbar capture, and auto-submit.
- Windows x64 installer and portable packaging: both completed successfully. Both executables are unsigned.
- Whitespace/error check: `git diff --check` passed.
- Dependency advisory check from the review: zero known vulnerabilities; no dependency versions were changed by these fixes.

Detailed final test outcomes are saved in `implementation-tests.json`; packaged-code integration results are in `packaged-smoke.json`. These cover unit logic, native Windows behavior, four provider fixtures, adversarial failures, the real application entry point, and stress scenarios. Dashboard and toolbar captures in `screenshots/` were visually inspected.

An intermediate run caught a native process crash (Windows exit code 3221225477) after the DPI suite's assertions completed. The strict runner correctly marked it failed. Electron test suites now terminate through `app.exit`, rather than abruptly calling Node's `process.exit`; the intermediate results are retained in `intermediate-run.json`. This was a test-process shutdown failure, not an assertion failure, and its precise native cause was not established.

The Windows installer and portable executable are generated under `dist/`. Packaging includes the application sources and license, without tests or review artifacts. The packaged archive is tested with the same Electron runtime and isolated profile; the installer is not installed on the user's machine.

## Remaining limits

- Authenticated sessions on the four live provider websites were not exercised. Their DOM and authentication flows can change independently of this project; local fixture tests cannot prove current live compatibility.
- Attachment and send confirmation depend on observable provider UI state. An unconfirmed result tells the user to inspect the conversation before retrying, because a timeout does not prove that the website did nothing.
- Capture exclusion and non-activation depend on Windows and the capture method. They are not guarantees of undetectability or exact background-window selection by the OS.
- Local executables are unsigned and use the existing default Electron icon. No release was published. The new hosted CI workflow has not yet run on GitHub.
- Existing global shortcut defaults are preserved as requested; they can still intercept ordinary editing keys in other applications. Users can rebind them.

The original project review remains a historical record of the pre-fix revision, not a description of the current implementation.
