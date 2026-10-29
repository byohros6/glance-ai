---
meta:
  contentType: How-to
---

# How to build and review the Chrome host prototype

TL;DR: Build the isolated WinForms controller with `build.ps1`. Run its self-test before opening a Chrome window.

## Build the prototype

Run `powershell -NoProfile -File tools/chrome-host-prototype/build.ps1` from the repository root. The script uses the installed .NET Framework C# compiler and writes the executable under ignored `dist/chrome-host-prototype/`.

Run the native-window self-test with `dist/chrome-host-prototype/ChromeHostController.exe --self-test --report=C:\path\to\self-test.txt`. The test creates and controls only its own dummy window. It reports native opacity readback, movement, topmost state, hide/show, and restoration.

## Use the controller

Click **Open Gemini** to start Chrome with `--app=https://gemini.google.com/app --new-window`. The controller compares visible Chrome windows before and after launch. It attaches only when exactly one new `Chrome_WidgetWin_1` window belongs to `chrome.exe` within 15 seconds.

The controller requires one stable candidate for 600 ms within its 15-second search. It excludes owned popup windows and fails if multiple candidates appear. It stores the selected window handle, process ID, process path, process start time, extended styles, layered attributes, placement, bounds, and visibility. It checks window class and process identity before each change.

Use the opacity slider, topmost checkbox, 40-pixel arrows, and hide/show buttons. The slider maps 15–100 percent to Windows layered alpha values. Click **Restore** to restore the captured window state. Click **Release** to restore and stop controlling that window. Closing the controller also attempts to restore the original state. These actions never close Chrome.

Hide and show call native `ShowWindow`. The prototype does not override Desktop Window Manager transitions because Windows exposes transition setting through a setter, not a readable snapshot. Verify visual animation timing during live review.

Chrome starts through its normal executable and profile behavior. The prototype does not inspect profiles, cookies, tabs, titles, or browser storage. It does not enable remote debugging, inject code, or add browser security switches.

## Prototype limits

The prototype does not implement capture, send, keyboard shortcuts, screenshot handling, or automatic hide/show integration. Those controls remain unverified. It does not replace Glance, change production files, or claim that Chrome fixes Gemini response latency.

## Known shortcut conflict

Chrome handles browser shortcuts inside the app-style window. For example, Ctrl+H can open History in another Chrome window. The prototype does not intercept those keys. This blocks feature parity with Glance.

Future integration must handle Glance shortcuts only within its controlled provider window. Ordinary Chrome windows must retain their shortcuts. Hidden-window recovery needs a separate, tested shortcut policy.

## Verification status

Six native-window self-tests pass. A live controller session reports successful opacity, movement, topmost, hide/show, and restore/release operations. The user reports fast signed-in replies in the Chrome window. These observations do not establish complete Glance functionality or a production latency fix.
