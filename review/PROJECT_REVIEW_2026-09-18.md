# Glance AI project review — 18–19 September 2026

**Verdict: a useful prototype with release-blocking security and reliability gaps.** The visual polish and test documentation imply substantially more confidence than the implementation supports. The central workflow needs to become trustworthy before adding providers or more visual customization.

Reviewed revision: `dd720f0`, version 1.2.0. Application source was not modified.

## Evidence and limits

- Read the main process, both preload copies, injection script, dashboard, fixtures, test infrastructure, packaging scripts, and project documentation; inspected saved dashboard and narrow-toolbar screenshots.
- Executed all 21 suites in the normal test catalog with isolated temporary settings: **20 passed, 1 failed**.
- Executed the four omitted adversarial/stress suites: **3 passed, 1 failed**. Total: **23 of 25 suites passed**.
- The settings recovery failure is reproducible: the test writes `undecgpt_settings.json` while a fresh store uses `glance_settings.json`. The interactive stress failure concerns restoration of background-window focus; treat this as an observed, environment-sensitive failure, not proof that every installation fails.
- Initial restricted execution prevented Electron renderers from starting. Those environment failures were excluded from the totals above; the reported results come from the subsequent successful runtime execution outside that restriction.
- Added temporary diagnostic probes against the actual preload, a controlled execution of the production main process, and source logic with mocked desktop boundaries. Main-process integration probes intercepted provider navigation to local fixtures and intercepted shortcut registration. Renderer capture probes returned synthetic markers, not desktop contents.
- Did not log into live provider accounts or validate their current upload/authentication behavior. A passing mock fixture does not prove compatibility with the live service.
- After explicit user approval, the read-only npm advisory check completed successfully: **zero known vulnerabilities reported across 284 dependencies**. This does not validate application logic, provider compatibility, or security properties outside npm's advisory coverage. The response is saved in `dependency-audit.json`.

The adjacent JSON evidence records suite outcomes and diagnostic results.

## Prioritized findings

### 1. P1 — Remote pages receive screen capture and desktop control privileges

**Evidence:** `src/preload/preload.cjs:4–32`, `src/main/main.js:224–281`, and the other IPC handlers below them.

The same preload runs on the local dashboard and remote provider pages. It exposes `captureScreen`, `saveSettings`, `closeApp`, shortcut management, and window controls directly as `window.glanceai` and `window.undecgpt`. The main handlers do not validate sender identity, frame, origin, or a user-initiated capture request. There is no top-level navigation restriction.

An unrelated local test page loaded with the production preload successfully invoked `window.glanceai.captureScreen()` and received the synthetic image marker. Separately, the production capture handler accepted a mocked sender with an unrelated origin. Thus context isolation is enabled, but the explicitly exposed bridge grants the sensitive capabilities anyway.

**Impact:** code executing in the loaded page can request screenshots without the user pressing Capture, alter settings, or disable controls. This does not require Node integration and is not a claim of arbitrary native code execution.

**Fix:** isolate trusted app controls from provider content. Keep the screenshot command and privileged bridge in trusted UI; expose no general capture API to the provider page. Validate each IPC sender/frame and payload, restrict navigation, and review permissions. Electron explicitly recommends these boundaries in its [security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

### 2. P1 — “Attached” and “Sent” do not mean attachment or sending succeeded

**Evidence:** `src/preload/preload.cjs:92–108`, `345–403`, `839–925`, `1010–1051`.

The upload engine treats event dispatch as success. Gemini's trigger sequence even returns true when it found no usable upload control, file input, or editor. The attach handler ignores the upload/prompt return values and displays success. The submit engine returns true after dispatching a click or synthetic Enter, without observing a submitted message.

Confirmed against the actual preload:

| Negative condition | Actual reported result |
| --- | --- |
| ChatGPT editor has no paste handler and no file input | Upload returns true |
| Gemini page has no upload controls or editor | Upload returns true |
| Send is disabled and no handler processes Enter | Submit returns true |
| Attach action runs against an empty page | Toast says “Attached! Press Ctrl+Enter to send.” |

There is also a specific event-semantics bug: a paste handler that calls `preventDefault()` makes `dispatchEvent()` return false, even if it handled the image. The app then tries a file-input fallback. A probe observed **one paste plus one file injection for one upload request**. The return value indicates cancellation, not upload success; see [MDN's dispatchEvent documentation](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/dispatchEvent).

**Impact:** missing or duplicate attachments, sending a prompt without its image, and misleading status messages. A fixed 400 ms delay before auto-submit cannot establish that a remote upload finished.

**Fix:** give each provider an adapter that verifies an attachment is accepted and ready, verifies prompt insertion, and observes a send transition. Return structured failures. Do not auto-submit until all prerequisites succeed. Keep unknown outcomes visibly unknown.

### 3. P1 — Default global shortcuts conflict with ordinary work and can trigger unintended uploads

**Evidence:** `src/main/store.js:18–34`, `src/main/main.js:188`, `src/main/shortcuts.js:14–44`.

The app globally claims common editing commands: Save, Find, Bold, history/navigation, cursor movement, and selection movement. Registration happens while the dashboard is open and remains active when the overlay is hidden.

Most concerning, **Ctrl+S captures the primary screen and injects it into the provider page**. Separating “attach” from “send” does not establish a local privacy boundary: file change/paste handlers in a live provider can upload the image immediately. Actual service network behavior was not tested, so users should not be told that their screenshot necessarily stays local until Ctrl+Enter.

**Fix:** use uncommon defaults such as Ctrl+Alt combinations, make global capture explicit, offer a pause indicator, show which monitor/region will be captured, and distinguish local preview from uploading. Provide conflict feedback before committing a binding.

### 4. P1 — The test runner can report failed suites as passed

**Evidence:** `tests/runner.js:172`; failure output in `tests/helpers/test_suite.js` goes to stderr.

The pass predicate permits a nonzero exit when stdout contains `0 failed`. It ignores stderr failures. The substring also matches `10 failed`.

Both diagnostic examples were accepted by the actual predicate:

- Exit code 1 after a `5 passed, 0 failed` summary.
- Exit code 1 with `0 passed, 10 failed`, with failure details on stderr.

The runner also lacks a suite timeout. A hung process can block the run indefinitely. The smoke test catches capture errors and can still print that all tests passed.

**Fix:** require a clean exit and a structured, complete test result; handle abnormal termination and enforce timeouts. Add focused tests of the runner's failure semantics. Do this before using a green run as a release gate.

### 5. P2 — Dashboard/overlay switching has two competing owners

**Evidence:** `src/main/shortcuts.js:69–76`, `src/preload/preload.cjs:1054–1056`, `src/main/main.js:97–102`.

Ctrl+B both sends `action:toggle-dashboard` and calls the main-process toggle. The preload handler always invokes `open-dashboard`.

**Confirmed with the production main process:** starting on the dashboard, Ctrl+B requested the Gemini URL, then ended back on `dashboard.html` with mode `dashboard`.

**Fix:** make the main process the sole owner of this transition. Send state notifications after transitions; do not turn them into another navigation command.

### 6. P2 — Dashboard preferences can disable the dashboard itself

**Evidence:** `src/renderer/dashboard.js:251–252`, `280–292`; `src/main/main.js:290–324`.

The dashboard's Click-Through setting immediately applies `setIgnoreMouseEvents(true)` to the same window displaying the settings. The dashboard has no overlay toolbar hover mechanism to restore interaction. Likewise, turning typing/focus off makes the settings window non-focusable. Save Settings reapplies these behaviors too.

**Impact:** changing an overlay preference can prevent using the controls needed to launch, edit, or undo it. Recovery depends on working global shortcuts.

**Fix:** persist overlay preferences while the dashboard stays interactive. Apply them only when entering overlay mode, with clearly defined mode-specific behavior.

### 7. P2 — Opening settings unloads the live conversation

**Evidence:** `src/main/main.js:39–53`, `56–93`.

Dashboard and provider content share one window and one webContents. Opening settings navigates away from the conversation. Returning loads the provider's generic root URL, not the prior conversation URL.

**Impact:** navigation/scroll state is lost; unsaved drafts or attachments may be discarded depending on the provider's persistence. Settings should not require replacing the live chat document.

**Fix:** retain the provider view and open trusted settings separately. A local shell with a separate provider view also helps solve the privileged-bridge problem.

### 8. P2 — Hidden-window recovery is incomplete

**Evidence:** `src/main/main.js:196–209`, `244–250`.

Hide sets opacity to zero, enables mouse forwarding, and hides the window. The second-instance handler shows it but restores neither opacity nor mouse behavior.

**Confirmed with the production main process:** after Hide and a second-instance event, the window was visible according to Electron but its opacity remained **0**. A logic probe also showed mouse forwarding remained enabled.

**Fix:** centralize hide/show restoration and use it for every entry point, including second-instance activation. Restore state according to the current mode, not a partial set of overlay flags.

### 9. P2 — Shortcut changes can silently leave the wrong controls active

**Evidence:** `src/main/shortcuts.js:59–65`, `240–251`; `src/main/main.js:344–350`; `src/renderer/dashboard.js:479–484`.

Rebinding Send still registers the original Ctrl+Enter/Return variants. Registration failures only log warnings, while the handler returns the saved shortcut table and the dashboard announces success. There is no duplicate detection or rollback.

A logic probe assigned Exit the screenshot binding: the settings saved successfully even though screenshot owned the key and Exit registration failed.

**Fix:** validate known action IDs and accelerators, normalize aliases, reject conflicts, preserve a working recovery binding, and report actual OS registration status. Update the hardcoded toolbar help/toasts to reflect customized bindings.

### 10. P2 — Capture and injection are not one serialized operation

**Evidence:** `src/main/screenshot.js:118–157`, `src/main/shortcuts.js:25–44`, `src/preload/preload.cjs:1010–1041`, `1443–1459`.

The capture mutex ends when the image is produced. The renderer then performs a separate, asynchronous multi-step upload with no shared operation lock. A second capture can begin while the previous injection or submit is still running. The toolbar and global shortcut use different implementations: toolbar Capture ignores `autoSubmit`, while the shortcut honors it.

Further risks: a provider switch/navigation during capture can deliver the image to a different document; injection replaces existing prompt text with `selectAll`; restoring capture-time window settings can overwrite newer user choices. The PowerShell fallback has no process timeout, so a stalled fallback can hold the capture lock and zero opacity indefinitely.

**Fix:** introduce one capture-to-attachment coordinator shared by toolbar and hotkeys. Bind operations to the originating provider/document, serialize them, support cancellation, preserve drafts, and distinguish capture, upload, ready, and submit states. Bound the fallback process and make restoration robust to later state changes.

### 11. P2 — Popup routing trusts substrings instead of origins

**Evidence:** `src/main/main.js:130–150`.

Any URL containing `google.com` is allowed as an auth popup. A probe confirmed that `https://unrelated.example/?next=accounts.google.com` is accepted. Other URLs are passed straight to `shell.openExternal` without protocol validation. The routing is Google-specific despite advertising four providers.

**Fix:** parse URLs and use explicit HTTPS origin rules for each supported auth flow; validate external protocols and destinations, restrict popup privileges, and test complete login/callback flows. Merely opening a non-Google auth flow in the external browser does not demonstrate that its authenticated session returns to Electron.

### 12. P2 — Multi-monitor behavior does not match “active workspace” wording

**Evidence:** `src/main/screenshot.js:27–49`, `src/main/shortcuts.js:230–237`, `src/main/main.js:60–68`; compare `tests/unit/coordinates_boundary.test.js:9–24`.

Capture always targets the primary display. If source matching fails, it can fall back to the first source. Window movement clamps only the minimum y coordinate; x and maximum y can move indefinitely off screen. Negative y is also a valid coordinate for a monitor above the primary display.

The coordinate test implements its own complete clamping function. Production never uses it. A source probe moved the production window position from `(9999, 9999)` to `(10039, 9999)`.

**Fix:** offer primary/current/selected display or region selection, preserve display identity, validate source matches, and recover bounds against the actual monitor layout at startup and on display changes. Test that production bounds logic directly.

## Why the existing tests overstate confidence

Many tests prove that Electron APIs can be called, or that a simplified fixture responds to a synthetic event. They do not prove the advertised user outcome.

- `tests/e2e/simulated_flow.test.js` creates its own BrowserWindow and IPC handlers instead of launching `src/main/main.js`. Its window options differ from production, including `type: 'toolbar'`, and it manually performs several actions. It cannot catch the production Ctrl+B bug.
- The coordinates and debounce suites recreate logic rather than exercise the actual implementations.
- OAuth tests copy a local handler, reproducing the vulnerable substring rule without hostile cases.
- Several content-protection assertions run only if `getContentProtection` exists; the installed Electron type declarations expose `isContentProtected`. An absent getter can silently skip the check. The separate native stress suite provides stronger evidence, but is not included in the default runner.
- `webrtc_fallback.test.js` does not force the fallback. The omitted capture stress suite does, and passed here.
- The current standard runner excludes the adversarial injection suite and all three stress suites.
- The corruption test targets the legacy filename. Other tests mutate a default store, sometimes resetting values to defaults rather than restoring prior values. Test settings should always use fresh temporary profiles.
- `TEST_READY.md` claims 100% coverage and real-world validation without measured coverage or live-provider evidence. It lists 20 suites while the current catalog lists 21.

The objective should be **tests that fail when a user-visible invariant breaks**, not increasing the count. Examples: one capture produces exactly one ready attachment; Send cannot report success without submission evidence; an unrelated page cannot invoke capture; dashboard round trips preserve the conversation; hidden-window activation restores interaction.

## Maintainability and product improvements

**Simplify the architecture.** `preload.js` and `preload.cjs` are byte-identical copies of more than 1,600 lines; only the CJS file is loaded in production. `injected.js` is loaded explicitly by an adversarial test, while production embeds its own interceptor implementation. This creates multiple places that appear authoritative. Keep one source, generate the preload if necessary, separate provider adapters from trusted UI and desktop controls, and remove test-only compatibility elements from production UI.

**Make persistence honest.** Settings saves perform synchronous disk writes for slider input and every prompt keystroke. Save errors are logged but not propagated, so “saved successfully” can be false. The store sanitizes on load/update but not consistently through `set`, and shortcuts accept unvalidated values. Debounce normal edits, enforce a shared schema, and return a persistence result.

**Improve recovery before styling.** There are no clear load-failure, renderer-crash, offline, or session-expiry recovery flows. A frameless hidden-taskbar app especially needs a dependable way to regain control. Provide an always-available recovery command and an explicit connection/session state.

**Clarify controls.** “Focus Mode” means non-interruption in the README but means direct typing enabled in the dashboard. Rename it “Allow typing in overlay” or use explicit interactive/read-only modes. Auto-save plus Save Settings makes it unclear when changes take effect. The saved narrow-toolbar image uses tiny abbreviated controls; move secondary controls into a compact menu while keeping capture, status, and recovery legible. The overall dashboard is coherent enough that a visual redesign is not the priority.

**Correct product claims.** `PROJECT.md` still describes UndecGPT, undetectability, and outdated milestones, while the README presents Glance AI as a productivity assistant. Screen-capture exclusion is not a guarantee of invisibility; [Microsoft explicitly documents that display-affinity content protection is not guaranteed](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity). Do not use spoofed user-agent strings or absent webdriver flags as proof of authentication compatibility or undetectability.

**Strengthen release hygiene.** No CI configuration is tracked. Signing is not required and the build script disables identity discovery; this review did not inspect Authenticode signatures on shipped binaries. The build batch file can print success from an old executable after a failed build because it does not stop on the builder exit code. There is no tracked LICENSE despite the MIT declaration, no Node engine requirement, and README binary links point into ignored `dist/`. Add reliable release gates, a real license file, supported runtime requirements, versioned release links, and a deliberate signing/update policy before wider distribution.

## Recommended implementation order

1. **Secure the boundary and the release signal:** remove remote capture privileges; validate IPC/navigation/popup rules; fix runner pass/fail handling and isolate test settings.
2. **Make the core workflow truthful:** one operation coordinator; verified attachment readiness and submission; no duplicate fallback, silent draft replacement, or false success messages.
3. **Repair mode transitions and recovery:** one dashboard toggle owner; independent settings UI; safe dashboard preferences; reliable hidden-window activation; transactional shortcut changes.
4. **Establish compatibility evidence:** production-entry integration tests, selected-display capture and bounds recovery, explicit live-provider checks, and clean Windows CI.
5. **Then polish distribution and UI:** simplify duplicated code, correct documentation, improve persistence/error reporting, and harden packaging.

I would keep the current provider breadth fixed until one provider's full capture → attachment → send → recovery flow is demonstrably reliable. The existing overlay, screenshot fallback, settings store, and UI can be retained; the work is mainly about trust boundaries, state ownership, and truthful verification.
