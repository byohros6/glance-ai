---
meta:
  contentType: How-to
---

# How to build and review the Chrome host prototype

TL;DR: Build the isolated WinForms controller with `build.ps1`. Run its self-test before opening a Chrome window.

## Build the prototype

Run `powershell -NoProfile -File tools/chrome-host-prototype/build.ps1` from the repository root. The script uses the installed .NET Framework C# compiler and writes the executable under ignored `dist/chrome-host-prototype/`.

Run the native-window self-test with `dist/chrome-host-prototype/ChromeHostController.exe --self-test --report=C:\path\to\self-test.txt`. The test creates and controls only its own dummy windows. It reports native opacity readback, movement, topmost state, hide/show, restoration, shortcut state and cleanup, and profile launch argument checks.

## Use the controller

Click **Open Gemini** to start Chrome with a dedicated profile at `%LOCALAPPDATA%\GlanceAI\BrowserProfile`, using only `--user-data-dir`, `--app=https://gemini.google.com/app`, and `--new-window`. The folder is created if needed and reused on later launches. This profile is separate from everyday Chrome, so sign in to Gemini manually the first time. The controller attaches only to a new `Chrome_WidgetWin_1` window owned by the process returned from that launch, matching its process ID, executable path, and start time.

If Chrome forwards the launch request to an already-running process and the returned process exits, the controller fails safely without attaching a different Chrome window. Close the Glance Chrome window and retry. Reusing an already-running dedicated Chrome process is not supported yet.

The controller requires one stable candidate for 600 ms within its 15-second search. It excludes owned popup windows and fails if multiple candidates appear. It stores the selected window handle, process ID, process path, process start time, extended styles, layered attributes, placement, bounds, and visibility. It checks window class and process identity before each change.

Use the opacity slider, topmost checkbox, 40-pixel arrows, and hide/show buttons. Ctrl+H hides the attached Chrome window only while it is the foreground window; other Chrome windows keep their normal Ctrl+H behavior. The hook checks only this chord and does not record keys. Click **Show** in the controller to recover a hidden window. Click **Restore** to restore the captured window state. Click **Release** to restore and stop controlling that window. Closing the controller also attempts to restore the original state. These actions never close Chrome.

The shortcut hooks are removed on **Release**, successful controller close, or attached-window destruction. The target's process and window identity is revalidated before Ctrl+H hides it. If the attached window disappears or changes identity, control is released.

Hide and show call native `ShowWindow`. The prototype does not override Desktop Window Manager transitions because Windows exposes transition setting through a setter, not a readable snapshot. Verify visual animation timing during live review.

The prototype does not read, copy, or delete the everyday Chrome profile or its cookies. It does not inspect tabs, titles, or browser storage. It does not enable remote debugging, inject code, or add browser security switches.

## Prototype limits

The prototype implements only the scoped Ctrl+H hide shortcut. It does not implement capture, send, screenshot handling, or other keyboard shortcuts. Hidden-window recovery currently requires the controller's **Show** button. It does not replace Glance, change production files, or claim that Chrome fixes Gemini response latency.

## Known shortcut conflict

Ctrl+H is intercepted only when the attached app window is foreground. The controller hides that window and suppresses Chrome's History action. The standalone **Show** button is the tested recovery path; recovery by shortcut is not implemented.

## Verification status

Eleven native-window and configuration self-tests pass. The shortcut tests use only prototype-owned dummy windows and verify target scoping, held-key state, hook cleanup on release and target destruction, hide/show recovery, and restoration. Launch checks validate the dedicated profile path, exactly the three allowed Chrome switches, and rejection of another Chrome PID, a reused PID, and an exited process. Chrome was not launched for this change; manual Gemini sign-in and live shortcut behavior still need user review. These observations do not establish complete Glance functionality or a production latency fix.
