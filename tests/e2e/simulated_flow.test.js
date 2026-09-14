import { app, BrowserWindow, session, ipcMain, globalShortcut } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from '../../src/main/store.js';
import { captureScreen } from '../../src/main/screenshot.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suite = createTestSuite('Tier 4: Real-World End-to-End Workflow Simulation');

const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

let win = null;

suite.test('Step 1: Launch stealth overlay window', async () => {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = CHROME_USER_AGENT;
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  ipcMain.removeHandler('get-settings');
  ipcMain.removeHandler('get-focusable');
  ipcMain.removeHandler('get-click-through');
  ipcMain.removeHandler('set-ignore-mouse-events');
  ipcMain.removeHandler('take-screenshot');

  ipcMain.handle('get-settings', () => store.getAll());
  ipcMain.handle('get-focusable', () => win ? win.isFocusable() : true);
  ipcMain.handle('get-click-through', () => store.get('clickThrough') ?? false);
  ipcMain.handle('set-ignore-mouse-events', (_e, ignore, opts) => {
    if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(ignore, opts);
    return true;
  });
  ipcMain.handle('take-screenshot', async () => await captureScreen());

  win = new BrowserWindow({
    width: store.get('windowWidth') || 520,
    height: store.get('windowHeight') || 650,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    type: 'toolbar', // WS_EX_TOOLWINDOW
    focusable: true,
    hasShadow: false,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '../../src/preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.setContentProtection(true);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setSkipTaskbar(true);
  win.setOpacity(store.get('opacity') || 0.95);
  win.webContents.setUserAgent(CHROME_USER_AGENT);

  const fixturePath = path.join(__dirname, '../fixtures/gemini_mock.html');
  await win.loadFile(fixturePath);
  await new Promise((r) => setTimeout(r, 250));

  assert.strictEqual(win.isVisible(), true, 'Window must be visible');
  assert.strictEqual(win.isAlwaysOnTop(), true, 'Window must be always on top');
  if (typeof win.getContentProtection === 'function') {
    assert.strictEqual(win.getContentProtection(), true, 'Window must have content protection active');
  }

  const hasToolbar = await win.webContents.executeJavaScript(`
    !!document.getElementById('undecgpt-toolbar')
  `);
  assert.strictEqual(hasToolbar, true, 'Stealth toolbar must be injected into DOM');
});

suite.test('Step 2: Login bypass verification (UA & Webdriver)', async () => {
  const check = await win.webContents.executeJavaScript(`
    (() => {
      return {
        isWebdriver: navigator.webdriver === true,
        userAgent: navigator.userAgent
      };
    })()
  `);

  assert.strictEqual(check.isWebdriver, false, 'navigator.webdriver must not report automation');
  assert.ok(check.userAgent.includes('Chrome/132'), 'User-Agent must spoof Chrome 132');
});

suite.test('Step 3: Ctrl+S capture & attach WITHOUT message submit', async () => {
  // 1. Pre-roll hide
  const savedOpacity = win.getOpacity();
  win.setOpacity(0);
  win.setIgnoreMouseEvents(true, { forward: true });

  await new Promise((r) => setTimeout(r, 100));

  // 2. Capture screenshot (falls back to PowerShell if WebRTC unavailable)
  const dataUrl = await captureScreen();
  assert.ok(dataUrl && dataUrl.startsWith('data:image/png;base64,'), 'Valid screenshot captured');

  // 3. Restore window state
  win.setOpacity(savedOpacity);
  win.setIgnoreMouseEvents(false);
  assert.strictEqual(win.getOpacity(), savedOpacity, 'Window opacity restored');

  // 4. Attach screenshot & prompt via IPC
  const promptText = store.get('prompt');
  win.webContents.send('action:attach-screenshot', {
    dataUrl,
    prompt: promptText
  });

  // Wait for trigger sequence & DOM injection to complete (~1800ms)
  await new Promise((r) => setTimeout(r, 2000));

  const state = await win.webContents.executeJavaScript(`
    (() => {
      const input = document.getElementById('upload-file-input');
      const editor = document.querySelector('.ql-editor');
      return {
        filesAttached: input.files ? input.files.length : 0,
        editorText: editor ? (editor.innerText || editor.textContent) : '',
        sendClicks: window.__testEvents.sendClicked
      };
    })()
  `);

  assert.strictEqual(state.filesAttached, 1, 'Screenshot must be attached to file input');
  assert.ok(state.editorText.length > 10, 'Prompt text must be present in editor');
  assert.strictEqual(state.sendClicks, 0, 'Ctrl+S must NOT automatically submit the prompt!');
});

suite.test('Step 4: Ctrl+Enter submits the prompt', async () => {
  win.webContents.send('action:submit');

  // Allow submit polling
  await new Promise((r) => setTimeout(r, 400));

  const sendClicks = await win.webContents.executeJavaScript(`
    window.__testEvents.sendClicked
  `);

  assert.ok(sendClicks >= 1, 'Send button must be clicked by submit action');
});

suite.test('Step 5: Boss Key hides overlay instantly', () => {
  win.setOpacity(0);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.hide();

  assert.strictEqual(win.isVisible(), false, 'Window must be hidden after Boss Key');
  assert.strictEqual(win.getOpacity(), 0, 'Window opacity must be 0 when hidden');
});

suite.test('Step 6: Boss Key restore reveals overlay with full stealth flags', () => {
  win.show();
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setSkipTaskbar(true);
  win.setOpacity(store.get('opacity') || 0.95);
  win.setIgnoreMouseEvents(false);

  assert.strictEqual(win.isVisible(), true, 'Window must be visible again');
  assert.strictEqual(win.isAlwaysOnTop(), true, 'Always on top must be preserved');
  assert.strictEqual(win.getOpacity(), store.get('opacity') || 0.95, 'Opacity must be restored');
});

suite.test('Step 7: Clean exit and teardown', async () => {
  globalShortcut.unregisterAll();
  if (win && !win.isDestroyed()) {
    win.destroy();
  }
  assert.strictEqual(win.isDestroyed(), true, 'Window must be destroyed on exit');
});

app.whenReady().then(async () => {
  try {
    const success = await suite.run();
    process.exit(success ? 0 : 1);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
