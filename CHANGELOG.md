# Changelog

## 1.2.1

- Harden provider IPC, navigation, permissions, and capture operations.
- Preserve the native provider UI, conversation and draft when opening settings.
- Correct window focus, shortcut rebinding, settings synchronization, and upload/send confirmation.
- Reduce redundant native window updates and fix lost repeated-scroll commands.
- Add isolated regression tests, packaging checks, and Windows CI.
- Validation: 29 suites / 131 cases and packaged-code smoke test passed before this version metadata update. Live provider responsiveness remains under investigation.

## Patch workflow

Each verified patch receives a patch-version increment, a changelog entry, and a Git commit. Keep the provider's original chat UI and existing features. Report local commit and remote push status separately.
