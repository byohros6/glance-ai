# Overlay responsiveness fixes

The selected provider still renders its original website and native chat interface. Opacity, capture exclusion, focus mode, click-through, shortcuts, and screenshot behavior remain available.

## Measured issues

An isolated local fixture reproduced two sources of unnecessary work:

| Workload | Before | After |
| --- | --- | --- |
| 100 opacity/window-state updates | 277.6 ms; 600 native setter calls | 18.7 ms; 200 native setter calls |
| 20 queued scroll commands requesting 2,000 px | 48 px after about 150 ms; only 100 px after settling | Full 2,000 px by the first sample |

Unchanged focus, taskbar, capture-protection, and always-on-top settings were being reapplied on every state update. The app now changes those flags only when necessary, while still restoring temporary capture and hover state. Repeated smooth-scroll requests restarted each other and lost distance; shortcut scrolling now accumulates commands and applies the movement once per animation frame. Normal provider mouse-wheel scrolling is untouched.

The toolbar's live backdrop blur was removed to reduce compositing work while the page moves underneath it. Button transitions now affect colors only. The redundant main-process callback for every outgoing provider request was removed; the existing browser user-agent configuration remains in place.

These measurements isolate app-controlled work. They do **not** mean the entire app or provider is 15 times faster. Live authenticated typing performance was not reproduced in this fixture. GPU compositing was enabled on the test machine, and hardware acceleration was left enabled. Full-page transparency remains controlled by the existing opacity setting.

## Evidence

Validation completed: syntax checks, all 29 regression suites (131 test cases), packaged-code integration, Windows installer/portable builds, and `git diff --check` passed.

- `performance-before.json` and `performance-after.json`: benchmark measurements and GPU status.
- `performance-regression-tests.json`: complete post-change regression results.
- `performance-packaged-smoke.json`: final packaged-code integration results.
- `tools/benchmark-overlay.mjs`: repeatable local benchmark using a disposable profile and fixture.

Both Windows executables under `dist/` are rebuilt with these changes. An already installed or running copy is not automatically replaced by rebuilding the project.
