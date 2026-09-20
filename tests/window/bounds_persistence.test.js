import { app, BrowserWindow } from 'electron';
import { store } from '../../src/main/store.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const suite = createTestSuite('Tier 1: Window Bounds Persistence');

let win = null;
let originalBounds = null;

suite.test('Window resize updates stored dimensions', async () => {
  originalBounds = {
    w: store.get('windowWidth'),
    h: store.get('windowHeight'),
    x: store.get('x'),
    y: store.get('y')
  };

  win = new BrowserWindow({
    width: originalBounds.w || 520,
    height: originalBounds.h || 650,
    frame: false,
    transparent: true,
    show: false
  });

  // Attach same listeners as in src/main/main.js
  win.on('resize', () => {
    if (!win || win.isDestroyed()) return;
    const [w, h] = win.getSize();
    store.set('windowWidth', w);
    store.set('windowHeight', h);
  });

  win.on('move', () => {
    if (!win || win.isDestroyed()) return;
    const [x, y] = win.getPosition();
    store.set('x', x);
    store.set('y', y);
  });

  win.setSize(580, 720);
  // Wait for event queue tick
  await new Promise((r) => setTimeout(r, 100));

  const [actualW, actualH] = win.getSize();
  assert.strictEqual(store.get('windowWidth'), actualW, 'store windowWidth must match resized window width');
  assert.strictEqual(store.get('windowHeight'), actualH, 'store windowHeight must match resized window height');
});

suite.test('Window move updates stored coordinates', async () => {
  win.setPosition(180, 140);
  await new Promise((r) => setTimeout(r, 100));

  const [actualX, actualY] = win.getPosition();
  assert.strictEqual(store.get('x'), actualX, 'store x must match moved window x');
  assert.strictEqual(store.get('y'), actualY, 'store y must match moved window y');
});

app.whenReady().then(async () => {
  const success = await suite.run();
  if (win && !win.isDestroyed()) {
    win.close();
  }
  // Restore original store bounds
  if (originalBounds) {
    store.set('windowWidth', originalBounds.w);
    store.set('windowHeight', originalBounds.h);
    store.set('x', originalBounds.x);
    store.set('y', originalBounds.y);
  }
  app.exit(success ? 0 : 1);
});
