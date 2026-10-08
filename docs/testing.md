# Test infrastructure

Run `npm test` on Windows with Node 22.12+ and dependencies installed. `npm run check` checks JavaScript syntax. `npm run test:smoke` runs the production-entry integration suite.

`npm run verify:repo` checks version consistency, pinned dependencies, required documentation, and accidental tracking of local artifacts. `npm run test:release` runs Node tests for checksum tampering, unsafe asset names, and mismatched release tags. These tests run separately from the Electron suites.

The runner discovers `*.test.js` under `unit`, `window`, `injection`, `e2e`, and `stress`. To narrow a run, use `node tests/runner.js production_app` or another filename fragment. Each suite gets a unique temporary Electron userData profile; the second-instance helper inherits that profile. Normal app settings are never used. Set `GLANCE_TEST_REPORT` to a writable filename to retain the complete results as JSON.

A pass requires zero exit status, no termination signal or timeout, and one structured `GLANCE_TEST_RESULT` with at least one passing assertion and no failures. Log substrings cannot turn a failed process into a pass. Unhandled main-process errors fail the suite. Every suite has a 90-second limit.

## Coverage boundaries

- Unit tests cover settings, actual window-bound clamping, capture locking/restoration, operation coordination, URL/sender authorization, shortcut validation, and runner failure semantics.
- Window suites exercise native window and shortcut APIs.
- Provider fixtures model paste/file/drop handling, upload progress, visible attachment previews, editor changes, and submitted user messages. Negative cases verify unknown outcomes, duplicate prevention, disabled send controls, draft preservation, and lack of remote app bridges.
- Production integration imports the actual main entry point, intercepts provider requests to local fixtures, supplies a synthetic capture image, and exercises mode switching, recovery, authorization, rebinding, and real toolbar input.
- Stress tests exercise capture fallback, native lifecycle, mouse forwarding, settings concurrency, and focus transitions.

Native focus tests require an interactive Windows desktop. Windows chooses the foreground destination after an active window becomes non-activating; tests require the overlay to release focus and preserve the resulting focus state, not to force a particular external application to the foreground.

Fixtures validate supported adapter behavior, not current live-provider authentication or DOM compatibility. No percentage coverage claim is made. Validate logged-in sessions and packaged binaries manually before publishing a release.
