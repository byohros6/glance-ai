import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const configured = new WeakMap();

// Scope the DWM transition policy to our HWND. Keeping WS_THICKFRAME retains
// native edge resizing; changing system animation preferences would affect other apps.
export function disableWindowTransitions(win) {
  if (process.platform !== 'win32' || !win || win.isDestroyed()) return Promise.resolve(false);
  if (configured.has(win)) return configured.get(win);
  const handle = win.getNativeWindowHandle();
  const hwnd = handle.length >= 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE());
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class GlanceWindowEffects {
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
}
'@
$handle = [IntPtr]::new([Int64]${hwnd})
[uint32]$owner = 0
[void][GlanceWindowEffects]::GetWindowThreadProcessId($handle, [ref]$owner)
if ($owner -ne ${process.pid}) { throw 'Window no longer belongs to this process' }
[int]$disabled = 1
$result = [GlanceWindowEffects]::DwmSetWindowAttribute($handle, 3, [ref]$disabled, 4)
if ($result -ne 0) { throw "DwmSetWindowAttribute failed: $result" }
`;
  const pending = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true, timeout: 5000, maxBuffer: 64 * 1024
  }).then(() => true).catch(error => {
    if (!win.isDestroyed()) console.warn('[Window effects] Could not disable transitions:', error.stderr?.trim() || error.message);
    return false;
  });
  configured.set(win, pending);
  return pending;
}
