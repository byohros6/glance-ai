import { app, BrowserWindow, globalShortcut } from 'electron';
import { registerGlobalShortcuts } from '../../src/main/shortcuts.js';
import { store } from '../../src/main/store.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const suite = createTestSuite('Tier 1: Global Shortcuts Registration');

let win = null;

suite.test('Registers all 14 global shortcuts with operating system', () => {
  win = new BrowserWindow({ show: false });
  registerGlobalShortcuts(() => win);

  const shortcuts = store.get('shortcuts');
  const expectedAccelerators = [
    shortcuts.screenshot,
    shortcuts.send,
    shortcuts.toggleVisibility,
    shortcuts.toggleFocus,
    shortcuts.toggleClickThrough,
    shortcuts.moveUp,
    shortcuts.moveDown,
    shortcuts.moveLeft,
    shortcuts.moveRight,
    shortcuts.scrollUp,
    shortcuts.scrollDown,
    shortcuts.opacityDown,
    shortcuts.opacityUp,
    shortcuts.emergencyExit
  ];

  for (const accel of expectedAccelerators) {
    const isReg = globalShortcut.isRegistered(accel);
    assert.strictEqual(isReg, true, `Accelerator '${accel}' should be registered`);
  }
});

suite.test('Unregisters all shortcuts cleanly', () => {
  globalShortcut.unregisterAll();
  const shortcuts = store.get('shortcuts');
  for (const key of Object.keys(shortcuts)) {
    const isReg = globalShortcut.isRegistered(shortcuts[key]);
    assert.strictEqual(isReg, false, `Accelerator '${shortcuts[key]}' should no longer be registered`);
  }
});

app.whenReady().then(async () => {
  const success = await suite.run();
  if (win && !win.isDestroyed()) {
    win.destroy();
  }
  globalShortcut.unregisterAll();
  app.exit(success ? 0 : 1);
});
