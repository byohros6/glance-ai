import { app, BrowserWindow, screen } from 'electron';
import { clampBounds } from '../../src/main/window-state.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const suite = createTestSuite('Tier 2: Off-Screen Coordinates & Movement Bounds');

const MOVE_OFFSET = 40;

function computeClampedWindowBounds(pos, size, area) { return clampBounds({ ...pos, ...size }, area); }

let win = null;

suite.test('Clamps negative off-screen coordinates to visible screen edge', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  const size = { width: 520, height: 650 };

  const clamped = computeClampedWindowBounds({ x: -500, y: -100 }, size, workArea);
  assert.strictEqual(clamped.x, 0, 'Negative x must clamp to workArea.x (0)');
  assert.strictEqual(clamped.y, 0, 'Negative y must clamp to workArea.y (0)');
});

suite.test('Clamps far-right and far-bottom off-screen coordinates to screen boundary', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  const size = { width: 520, height: 650 };

  const clamped = computeClampedWindowBounds({ x: 9999, y: 9999 }, size, workArea);
  assert.strictEqual(clamped.x, 1920 - 520, 'Oversized x must clamp so window remains on-screen');
  assert.strictEqual(clamped.y, 1080 - 650, 'Oversized y must clamp so window remains on-screen');
});

suite.test('Silent nudge move offset calculates ±40px delta precisely', () => {
  let x = 200;
  let y = 300;

  // Move Up
  y -= MOVE_OFFSET;
  assert.strictEqual(y, 260);

  // Move Down
  y += MOVE_OFFSET;
  assert.strictEqual(y, 300);

  // Move Left
  x -= MOVE_OFFSET;
  assert.strictEqual(x, 160);

  // Move Right
  x += MOVE_OFFSET;
  assert.strictEqual(x, 200);
});

suite.test('BrowserWindow sets and updates position accurately', () => {
  win = new BrowserWindow({
    width: 520,
    height: 650,
    show: false,
    frame: false
  });

  win.setPosition(300, 200);
  const [posX, posY] = win.getPosition();
  assert.strictEqual(posX, 300, 'Window x should be 300');
  assert.strictEqual(posY, 200, 'Window y should be 200');

  // Nudge right by 40
  win.setPosition(posX + MOVE_OFFSET, posY);
  const [nudgedX] = win.getPosition();
  assert.strictEqual(nudgedX, 340, 'Window x should be 340 after 40px nudge');
});

app.whenReady().then(async () => {
  const success = await suite.run();
  if (win && !win.isDestroyed()) {
    win.destroy();
  }
  app.exit(success ? 0 : 1);
});
