import { app, BrowserWindow } from 'electron';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const suite = createTestSuite('Tier 2: Opacity Range Clamping [0.15, 1.0]');

function clampOpacity(val) {
  if (isNaN(val)) return 0.95;
  return Math.max(0.15, Math.min(1.0, val));
}

function stepDown(current) {
  return Math.max(0.15, Math.round((current - 0.1) * 100) / 100);
}

function stepUp(current) {
  return Math.min(1.0, Math.round((current + 0.1) * 100) / 100);
}

let win = null;

suite.test('Clamps lower boundary values to 0.15 minimum opacity', () => {
  assert.strictEqual(clampOpacity(0.0), 0.15);
  assert.strictEqual(clampOpacity(-1.0), 0.15);
  assert.strictEqual(clampOpacity(0.14), 0.15);
  assert.strictEqual(clampOpacity(0.149), 0.15);
  assert.strictEqual(clampOpacity(0.15), 0.15);
});

suite.test('Clamps upper boundary values to 1.0 maximum opacity', () => {
  assert.strictEqual(clampOpacity(1.0), 1.0);
  assert.strictEqual(clampOpacity(1.01), 1.0);
  assert.strictEqual(clampOpacity(2.5), 1.0);
  assert.strictEqual(clampOpacity(100.0), 1.0);
});

suite.test('Preserves valid in-range opacity values', () => {
  assert.strictEqual(clampOpacity(0.5), 0.5);
  assert.strictEqual(clampOpacity(0.75), 0.75);
  assert.strictEqual(clampOpacity(0.95), 0.95);
});

suite.test('Step down shortcut logic clamps at 0.15 and rounds cleanly', () => {
  assert.strictEqual(stepDown(0.95), 0.85);
  assert.strictEqual(stepDown(0.85), 0.75);
  assert.strictEqual(stepDown(0.7), 0.6); // Prevents float inaccuracy 0.6000000000000001
  assert.strictEqual(stepDown(0.2), 0.15); // Cannot drop below 0.15
  assert.strictEqual(stepDown(0.15), 0.15);
});

suite.test('Step up shortcut logic clamps at 1.0 and rounds cleanly', () => {
  assert.strictEqual(stepUp(0.8), 0.9);
  assert.strictEqual(stepUp(0.95), 1.0); // Cannot exceed 1.0
  assert.strictEqual(stepUp(1.0), 1.0);
});

suite.test('BrowserWindow applies clamped opacity without error', () => {
  win = new BrowserWindow({ show: false });

  const testValues = [-0.5, 0.0, 0.14, 0.15, 0.5, 0.95, 1.0, 1.5];
  for (const raw of testValues) {
    const clamped = clampOpacity(raw);
    assert.doesNotThrow(() => {
      win.setOpacity(clamped);
    }, `win.setOpacity(${clamped}) must succeed`);
    assert.ok(win.getOpacity() >= 0.149, 'Window opacity must be at least 0.15');
    assert.ok(win.getOpacity() <= 1.0, 'Window opacity must not exceed 1.0');
  }
});

app.whenReady().then(async () => {
  const success = await suite.run();
  if (win && !win.isDestroyed()) {
    win.close();
  }
  process.exit(success ? 0 : 1);
});
