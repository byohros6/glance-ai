# Glance AI architecture

Glance AI is a Windows desktop companion for Gemini, ChatGPT, Claude, and Perplexity. The historical UndecGPT specifications in ORIGINAL_REQUEST.md describe the project's origins, not guarantees of invisibility or measured coverage.

## Window ownership

The main process owns a persistent provider overlay and a separate local settings window. Settings navigation never replaces the live conversation. One dashboard toggle decides which window is visible. `window-state.js` owns hide/show restoration, non-activation, display-bound clamping, opacity, and click-through flags. An active overlay is briefly hidden before changing to non-activating mode so Windows releases its existing focus.

## Trust boundaries

`security.js` validates HTTPS provider/auth origins and the exact IPC sender and main frame. `preload.cjs` exposes the settings API only on the local dashboard. Remote provider pages receive no `glanceai`, `undecgpt`, or `upload` bridge. Toolbar listeners reject synthetic events. An explicitly enabled local fixture API is available to tests only (`--glance-test-api` plus a file-backed mock page); production windows never pass that argument.

Auth popups use `auth.cjs`, which exposes nothing. Unexpected navigation is prevented. Only HTTP(S) links can be handed to the default browser. Website permission requests are restricted by origin and require an explicit decision.

## Capture and send

`OperationCoordinator` holds the lock across capture and renderer acknowledgement. Each request has an ID, a timeout, and a source document. Navigation cancels it. The renderer serializes actions and observes attachment previews, pending upload indicators, editor changes, and conversation transitions. Event dispatch alone is not success. An ambiguous delivery never automatically triggers a second attachment. A disabled Send button is respected; Enter is a fallback only if a Send control is absent.

Capture continues to target the primary display for compatibility. `screenshot.js` first uses Electron's capture source matched by display ID, then a bounded DPI-aware Windows fallback. Temporary files are removed and window state restored from current settings.

## Settings and shortcuts

Settings retain the existing filename/migration behavior. A sanitized schema bounds window dimensions and known settings. Writes use a temporary file followed by rename. The dashboard batches rapid edits and handles persistence failures. Shortcut changes validate aliases and duplicates, attempt OS registration, and restore the old bindings if registration fails. Defaults remain unchanged.

## Verification

`npm test` discovers every `*.test.js` in the five test directories, creates a fresh profile per suite, requires a structured success result and zero exit status, and enforces a timeout. Tests include the actual main-process entry point with locally intercepted provider pages and synthetic captures. Live-provider login/session compatibility still requires manual validation; mock tests cannot establish it.
