import { app, BrowserWindow } from 'electron';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const suite = createTestSuite('Tier 1: Stealth Window Flags & Native OS Integration');

let win = null;

suite.test('Window is created with borderless, transparent, and toolbar flags', () => {
  win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    type: 'toolbar', // Windows WS_EX_TOOLWINDOW
    hasShadow: false,
    focusable: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  assert.ok(win, 'BrowserWindow should be instantiated');
  assert.strictEqual(win.isDestroyed(), false, 'Window must not be destroyed');
});

suite.test('Window has setContentProtection enabled for screen-share stealth', () => {
  win.setContentProtection(true);
  if (typeof win.getContentProtection === 'function') {
    assert.strictEqual(win.getContentProtection(), true, 'Content protection must be enabled');
  }
});

suite.test('Window pins to top-most screen-saver z-order level', () => {
  win.setAlwaysOnTop(true, 'screen-saver');
  assert.strictEqual(win.isAlwaysOnTop(), true, 'Window must be always-on-top');
});

suite.test('Window supports toggling non-activating focus mode (WS_EX_NOACTIVATE)', () => {
  assert.strictEqual(win.isFocusable(), true, 'Initial focusable should be true');

  win.setFocusable(false);
  assert.strictEqual(win.isFocusable(), false, 'Window must become non-focusable when set to false');

  win.setFocusable(true);
  assert.strictEqual(win.isFocusable(), true, 'Window must restore focusable when set to true');
});

suite.test('Window supports click-through mouse event ignoring with forwarding', () => {
  // Should not throw and successfully apply native flags
  assert.doesNotThrow(() => {
    win.setIgnoreMouseEvents(true, { forward: true });
  }, 'setIgnoreMouseEvents(true, { forward: true }) must succeed');

  assert.doesNotThrow(() => {
    win.setIgnoreMouseEvents(false);
  }, 'setIgnoreMouseEvents(false) must succeed');
});

suite.test('Window supports taskbar exclusion', () => {
  assert.doesNotThrow(() => {
    win.setSkipTaskbar(true);
  }, 'setSkipTaskbar(true) must succeed');
});

app.whenReady().then(async () => {
  const success = await suite.run();
  if (win && !win.isDestroyed()) {
    win.close();
  }
  process.exit(success ? 0 : 1);
});
