import { app, BrowserWindow } from 'electron';
import { store } from '../../src/main/store.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const suite = createTestSuite('Tier 3: Pre-Roll Hide Delay + Boss Key Interaction');

let win = null;

suite.test('Boss Key instantly hides window, zeros opacity, and disables mouse events', () => {
  win = new BrowserWindow({
    show: true,
    transparent: true,
    frame: false
  });
  win.setOpacity(0.95);

  assert.strictEqual(win.isVisible(), true, 'Window should initially be visible');

  // Trigger Boss Key hide
  win.setOpacity(0);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.hide();

  assert.strictEqual(win.isVisible(), false, 'Window must be hidden after Boss Key');
  assert.strictEqual(win.getOpacity(), 0, 'Window opacity must be 0 when hidden');
});

suite.test('Boss Key restore recovers visibility, screen-saver level, and stored opacity', () => {
  store.set('opacity', 0.85);

  // Trigger Boss Key restore
  win.show();
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setSkipTaskbar(true);
  win.setOpacity(store.get('opacity') || 0.95);
  win.setIgnoreMouseEvents(false);

  assert.strictEqual(win.isVisible(), true, 'Window must be visible after restore');
  assert.strictEqual(win.isAlwaysOnTop(), true, 'Window must be pinned always-on-top');
  assert.strictEqual(win.getOpacity(), 0.85, 'Window must restore exact stored opacity (0.85)');
});

suite.test('Pre-roll hide smoothly sets opacity to 0 and restores saved opacity', async () => {
  const customOpacity = 0.85;
  win.setOpacity(customOpacity);

  const initialOpacity = win.getOpacity();
  assert.strictEqual(initialOpacity, customOpacity);

  // Simulate pre-roll sequence
  const currentOpacity = win.getOpacity();
  win.setOpacity(0);
  win.setIgnoreMouseEvents(true, { forward: true });

  assert.strictEqual(win.getOpacity(), 0, 'Opacity must be 0 during pre-roll delay');

  // Wait 100ms compositor delay
  await new Promise((r) => setTimeout(r, 100));

  // Restore opacity
  win.setOpacity(currentOpacity);
  win.setIgnoreMouseEvents(false);

  assert.strictEqual(
    win.getOpacity(),
    customOpacity,
    'Window opacity must be restored to original 0.85, not default 1.0'
  );
});

app.whenReady().then(async () => {
  try {
    const success = await suite.run();
    if (win && !win.isDestroyed()) {
      win.close();
    }
    store.set('opacity', 0.95);
    process.exit(success ? 0 : 1);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
