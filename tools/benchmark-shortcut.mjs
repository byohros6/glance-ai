import { app, BrowserWindow, globalShortcut, screen } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function main() {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'glance-shortcut-'));
  app.setPath('userData', profile);
  await app.whenReady();
  const { registerGlobalShortcuts, createShortcutHandlers } = await import(pathToFileURL(path.resolve(process.env.GLANCE_TEST_APP_ROOT || '.', 'src/main/shortcuts.js')).href);
  const area = screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({ x: area.x + 100, y: area.y + 100, width: 400, height: 400, frame: false, transparent: true, show: false });
  await win.loadURL('data:text/html,<body>Isolated shortcut latency probe</body>');
  win.showInactive();
  const registered = globalShortcut.register.bind(globalShortcut);
  let deliveredAt = null;
  let movedAt = null;
  const handlers = createShortcutHandlers(() => win);
  globalShortcut.register = (key, callback) => {
    if (key !== 'CommandOrControl+Left') return true;
    return registered(key, () => { deliveredAt = Date.now(); callback(); });
  };
  registerGlobalShortcuts(() => win, null, { moveLeft: () => { handlers.moveLeft(); movedAt = Date.now(); } });
  const script = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class GlanceProbeKeys { [DllImport("user32.dll")] public static extern void keybd_event(byte v, byte s, uint f, UIntPtr e); }'
$pressed = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
[GlanceProbeKeys]::keybd_event(0x11,0,0,[UIntPtr]::Zero)
[GlanceProbeKeys]::keybd_event(0x25,0,0,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
[GlanceProbeKeys]::keybd_event(0x25,0,2,[UIntPtr]::Zero)
[GlanceProbeKeys]::keybd_event(0x11,0,2,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 1000
Write-Output $pressed`;
  const { stdout } = await promisify(execFile)('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000 });
  // Permit a queued microtask to finish, but keep its original timestamps.
  await new Promise(resolve => setImmediate(resolve));
  const pressedAt = Number(stdout.trim());
  const report = { pressedAt, deliveredAt, movedAt, keyDeliveryMs: deliveredAt === null ? null : deliveredAt - pressedAt, dispatchDelayMs: movedAt === null ? null : movedAt - deliveredAt, keyToMoveMs: movedAt === null ? null : movedAt - pressedAt, actualX: win.getBounds().x, expectedX: area.x + 60 };
  await fs.writeFile(process.argv[2] || 'review/shortcut-latency.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  globalShortcut.unregisterAll(); win.destroy();
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
  app.exit(movedAt !== null && report.actualX === report.expectedX ? 0 : 1);
}
main().catch(error => { console.error(error); app.exit(1); });
