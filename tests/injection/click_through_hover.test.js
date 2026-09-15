import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from '../../src/main/store.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suite = createTestSuite('Tier 3: Click-Through ON + Toolbar Hover Interaction');

let win = null;
const mouseEventsCalls = [];

suite.test('Toolbar hover allows controls clicking during Click-Through mode', async () => {
  store.set('clickThrough', true);

  // Setup IPC handlers needed by preload
  ipcMain.removeHandler('set-ignore-mouse-events');
  ipcMain.removeHandler('get-click-through');
  ipcMain.removeHandler('get-focusable');
  ipcMain.removeHandler('get-settings');

  ipcMain.handle('set-ignore-mouse-events', (_event, ignore, options) => {
    mouseEventsCalls.push({ ignore, options });
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(ignore, options);
    }
    return true;
  });

  ipcMain.handle('get-click-through', () => {
    return store.get('clickThrough') ?? false;
  });

  ipcMain.handle('get-focusable', () => {
    return store.get('focusable') ?? true;
  });

  ipcMain.handle('get-settings', () => {
    return store.getAll();
  });

  win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../../src/preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const fixturePath = path.join(__dirname, '../fixtures/gemini_mock.html');
  await win.loadFile(fixturePath);
  await new Promise((r) => setTimeout(r, 200));

  // Sync click-through active state to renderer
  win.webContents.send('action:click-through-changed', true);
  await new Promise((r) => setTimeout(r, 50));

  // Clear startup calls
  mouseEventsCalls.length = 0;

  // Step 1: Simulate hovering over toolbar (mouseenter)
  const hovered = await win.webContents.executeJavaScript(`
    (() => {
      const toolbar = document.getElementById('undecgpt-toolbar');
      if (!toolbar) return false;
      toolbar.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      return true;
    })()
  `);

  assert.strictEqual(hovered, true, 'Toolbar element #undecgpt-toolbar must exist');
  await new Promise((r) => setTimeout(r, 100));

  assert.ok(mouseEventsCalls.length > 0, 'Should have received set-ignore-mouse-events call');
  assert.strictEqual(
    mouseEventsCalls[mouseEventsCalls.length - 1].ignore,
    false,
    'Hovering toolbar must set ignoreMouseEvents to false so controls can receive clicks'
  );

  // Step 2: Simulate leaving toolbar (mouseleave)
  await win.webContents.executeJavaScript(`
    (() => {
      const toolbar = document.getElementById('undecgpt-toolbar');
      toolbar.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    })()
  `);

  await new Promise((r) => setTimeout(r, 100));
  const lastCall = mouseEventsCalls[mouseEventsCalls.length - 1];
  assert.strictEqual(
    lastCall.ignore,
    true,
    'Leaving toolbar must restore ignoreMouseEvents to true when clickThrough is ON'
  );
  assert.deepStrictEqual(
    lastCall.options,
    { forward: true },
    'Must include { forward: true } for mouse event forwarding'
  );
});

suite.test('Toolbar leave does NOT enable click-through if mode is OFF', async () => {
  store.set('clickThrough', false);
  win.webContents.send('action:click-through-changed', false);
  await new Promise((r) => setTimeout(r, 50));

  mouseEventsCalls.length = 0;

  await win.webContents.executeJavaScript(`
    (() => {
      const toolbar = document.getElementById('undecgpt-toolbar');
      toolbar.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    })()
  `);

  await new Promise((r) => setTimeout(r, 100));
  const hasIgnoreTrue = mouseEventsCalls.some((c) => c.ignore === true);
  assert.strictEqual(
    hasIgnoreTrue,
    false,
    'Leaving toolbar when clickThrough is OFF must not enable ignoreMouseEvents'
  );
});

app.whenReady().then(async () => {
  try {
    const success = await suite.run();
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
    store.set('clickThrough', false);
    store.flush();
    process.exit(success ? 0 : 1);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
