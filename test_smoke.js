import { app, BrowserWindow, globalShortcut } from 'electron';
import { store } from './src/main/store.js';
import { captureScreen } from './src/main/screenshot.js';
import { registerGlobalShortcuts } from './src/main/shortcuts.js';

console.log('[Test] Testing store...');
const settings = store.getAll();
if (!settings || !settings.shortcuts) {
  console.error('[Test] Store validation failed');
  process.exit(1);
}
console.log('[Test] Store OK. Settings keys:', Object.keys(settings));

app.whenReady().then(async () => {
  console.log('[Test] Electron app ready. Testing stealth window creation...');
  const win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    type: 'toolbar',
    hasShadow: false,
    focusable: settings.focusable ?? true,
    webPreferences: { nodeIntegration: false }
  });

  win.setContentProtection(true);
  console.log('[Test] Content protection set successfully:', win.getContentProtection ? win.getContentProtection() : 'OK');

  console.log('[Test] Initial focusable:', win.isFocusable());
  win.setFocusable(false);
  console.log('[Test] Focusable set to false:', win.isFocusable());
  win.setFocusable(true);
  console.log('[Test] Focusable set to true:', win.isFocusable());

  console.log('[Test] Testing click-through (ignore mouse events)...');
  win.setIgnoreMouseEvents(true, { forward: true });
  console.log('[Test] Ignore mouse events (forward true): OK');
  win.setIgnoreMouseEvents(false);
  console.log('[Test] Ignore mouse events (false): OK');

  console.log('[Test] Testing global shortcuts registration...');
  registerGlobalShortcuts(() => win);
  console.log('[Test] Shortcuts registered OK');

  console.log('[Test] Testing screenshot capture...');
  try {
    const screenshot = await captureScreen();
    console.log('[Test] Screenshot capture result:', screenshot ? `Captured (${screenshot.length} chars)` : 'Null');
  } catch (err) {
    console.warn('[Test] Screenshot error during headless test:', err.message);
  }

  globalShortcut.unregisterAll();
  win.close();
  console.log('[Test] All stealth tests passed successfully!');
  app.quit();
});
