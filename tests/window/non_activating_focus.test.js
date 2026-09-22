import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from '../../src/main/store.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suite = createTestSuite('Tier 3: Non-Activating Focus Mode Interaction');

let win = null;

suite.test('Window starts with focusable mode and can switch to non-activating', async () => {
  store.set('focusable', true);

  ipcMain.removeHandler('get-focusable');
  ipcMain.removeHandler('set-focusable');
  ipcMain.removeHandler('get-click-through');
  ipcMain.removeHandler('get-settings');

  ipcMain.handle('get-focusable', () => win.isFocusable());
  ipcMain.handle('set-focusable', (_event, val) => {
    win.setFocusable(val);
    store.set('focusable', val);
    return val;
  });
  ipcMain.handle('get-click-through', () => store.get('clickThrough') ?? false);
  ipcMain.handle('get-settings', () => store.getAll());

  win = new BrowserWindow({
    show: false,
    focusable: true,
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

  assert.strictEqual(win.isFocusable(), true, 'Window should initially be focusable');

  // Toggle to non-activating focus mode (WS_EX_NOACTIVATE)
  win.setFocusable(false);
  store.set('focusable', false);
  assert.strictEqual(win.isFocusable(), false, 'Window must not be focusable when non-activating mode is ON');

  // Notify preload of state change
  win.webContents.send('action:focus-changed', false);
  await new Promise((r) => setTimeout(r, 100));

  const buttonState = await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.getElementById('glance-focus-btn');
      return {
        text: btn ? btn.textContent.trim() : null,
        hasActive: btn ? btn.classList.contains('active') : false
      };
    })()
  `);

  assert.ok(buttonState.text && buttonState.text.includes('OFF'), 'Focus button should display OFF');
  assert.strictEqual(buttonState.hasActive, false, 'Focus button should not have active class when focus is OFF');
});

suite.test('Restoring focus mode enables focus and updates UI to active', async () => {
  win.setFocusable(true);
  store.set('focusable', true);
  assert.strictEqual(win.isFocusable(), true, 'Window focusable restored');

  win.webContents.send('action:focus-changed', true);
  await new Promise((r) => setTimeout(r, 100));

  const buttonState = await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.getElementById('glance-focus-btn');
      return {
        text: btn ? btn.textContent.trim() : null,
        hasActive: btn ? btn.classList.contains('active') : false
      };
    })()
  `);

  assert.ok(buttonState.text && buttonState.text.includes('ON'), 'Focus button should display ON');
  assert.strictEqual(buttonState.hasActive, true, 'Focus button should have active class when focus is ON');
});

app.whenReady().then(async () => {
  try {
    const success = await suite.run();
    if (win && !win.isDestroyed()) {
      win.close();
    }
    store.set('focusable', true);
    app.exit(success ? 0 : 1);
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
