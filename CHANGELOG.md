# Changelog

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
