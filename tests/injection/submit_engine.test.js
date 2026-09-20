import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from '../../src/main/store.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suite = createTestSuite('Tier 2: Message Submit Engine');

let win = null;

suite.test('Clicks enabled send message button', async () => {
  ipcMain.removeHandler('get-focusable');
  ipcMain.removeHandler('get-click-through');
  ipcMain.removeHandler('get-settings');

  ipcMain.handle('get-focusable', () => true);
  ipcMain.handle('get-click-through', () => false);
  ipcMain.handle('get-settings', () => store.getAll());

  win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../../src/preload/preload.cjs'),
      additionalArguments: ['--glance-test-api'],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const fixturePath = path.join(__dirname, '../fixtures/gemini_mock.html');
  await win.loadFile(fixturePath);
  await new Promise((r) => setTimeout(r, 200));

  const initialClicks = await win.webContents.executeJavaScript('window.__testEvents.sendClicked');

  const submitResult = await win.webContents.executeJavaScript(`
    (async () => {
      const ok = await window.upload.submitPrompt();
      return {
        ok,
        sendClicks: window.__testEvents.sendClicked
      };
    })()
  `);

  assert.strictEqual(submitResult.ok, true, 'submitPrompt should return true');
  assert.strictEqual(submitResult.sendClicks, initialClicks + 1, 'Send button click listener should increment');
});

suite.test('Does not bypass a disabled send button', async () => {
  const fallbackResult = await win.webContents.executeJavaScript(`
    (async () => {
      const sendBtn = document.getElementById('send-btn');
      sendBtn.setAttribute('disabled', 'true');

      const ok = await window.upload.submitPrompt();
      sendBtn.removeAttribute('disabled');

      return {
        ok,
        enterEvents: window.__testEvents.enterKeyDownDispatched
      };
    })()
  `);

  assert.strictEqual(fallbackResult.ok, false, 'A disabled send control must not be bypassed');
  assert.strictEqual(fallbackResult.enterEvents, 0, 'No fallback is allowed when Send is explicitly disabled');
});

app.whenReady().then(async () => {
  try {
    const success = await suite.run();
    if (win && !win.isDestroyed()) {
      win.close();
    }
    app.exit(success ? 0 : 1);
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
