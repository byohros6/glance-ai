import { app, BrowserWindow, globalShortcut } from 'electron';
import path from 'node:path';
import os from 'node:os';

const tempUserData = path.join(os.tmpdir(), 'test_kill_switch_ud_' + Date.now() + '_' + Math.random().toString(36).slice(2));
app.setPath('userData', tempUserData);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load an HTML page with an aggressive beforeunload blocker
  await win.loadURL('data:text/html,<html><body><h1>Test Page</h1><script>window.addEventListener("beforeunload", (e) => { e.preventDefault(); e.returnValue = "BLOCK"; return "BLOCK"; }); window.onbeforeunload = (e) => { e.preventDefault(); e.returnValue = "BLOCK"; return "BLOCK"; };</script></body></html>');

  // Verify that beforeunload is active
  await win.webContents.executeJavaScript('window.onbeforeunload !== null');

  // Simulate Emergency Exit triggered (exact logic from src/main/shortcuts.js)
  const startExitTime = Date.now();
  try {
    globalShortcut.unregisterAll();
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
  } catch (e) {
    console.error('Error in emergency destroy:', e);
  }
  console.log(`EMERGENCY_EXIT_EXECUTION_TIME_MS:${Date.now() - startExitTime}`);
  
  // Clean exit
  app.exit(0);
});
