import { app, BrowserWindow } from 'electron';
import { store } from '../../src/main/store.js';
import { createShortcutHandlers } from '../../src/main/shortcuts.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';

// Regression: repeated Ctrl+Arrow moves (and edge clamps) must never change the
// overlay's size. A frameless window's getBounds() can round-trip a few pixels
// larger; feeding that back into setBounds grew the window on every move.
const suite = createTestSuite('Overlay move preserves size');

let win = null;
const saved = { w: store.get('windowWidth'), h: store.get('windowHeight'), x: store.get('x'), y: store.get('y') };

suite.test('Many moves and a hard edge push keep the stored size fixed', async () => {
  store.set('windowWidth', 520);
  store.set('windowHeight', 650);
  win = new BrowserWindow({ width: 520, height: 650, frame: false, transparent: false, show: false });
  win.on('move', () => { if (!win.isDestroyed()) { const b = win.getBounds(); store.setBounds({ x: b.x, y: b.y }); } });

  const h = createShortcutHandlers(() => win, () => {});
  for (let i = 0; i < 25; i++) { h.moveRight(); h.moveDown(); h.moveLeft(); h.moveUp(); await new Promise(r => setTimeout(r, 1)); }
  for (let i = 0; i < 80; i++) h.moveLeft();  // slam into the left edge
  for (let i = 0; i < 80; i++) h.moveUp();    // slam into the top edge
  await new Promise(r => setTimeout(r, 40));

  assert.strictEqual(store.get('windowWidth'), 520, 'stored width unchanged after moves');
  assert.strictEqual(store.get('windowHeight'), 650, 'stored height unchanged after moves');
  const [w, hgt] = win.getSize();
  assert.ok(Math.abs(w - 520) <= 6 && Math.abs(hgt - 650) <= 6, `window size stayed ~520x650, got ${w}x${hgt}`);
});

app.whenReady().then(async () => {
  const ok = await suite.run();
  if (win && !win.isDestroyed()) win.close();
  store.set('windowWidth', saved.w); store.set('windowHeight', saved.h); store.set('x', saved.x); store.set('y', saved.y);
  app.exit(ok ? 0 : 1);
});