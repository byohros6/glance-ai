import { app, screen } from 'electron';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const suite = createTestSuite('Tier 2: scaleFactor DPI Scaling Calculation');

function calculateCaptureDimensions(width, height, scaleFactor = 1) {
  const sf = scaleFactor || 1;
  return {
    captureWidth: Math.round(width * sf),
    captureHeight: Math.round(height * sf)
  };
}

suite.test('Standard 100% DPI scaling (scaleFactor 1.0) preserves physical resolution', () => {
  const dims = calculateCaptureDimensions(1920, 1080, 1.0);
  assert.strictEqual(dims.captureWidth, 1920);
  assert.strictEqual(dims.captureHeight, 1080);
});

suite.test('125% DPI scaling (scaleFactor 1.25) calculates high-resolution capture size', () => {
  const dims = calculateCaptureDimensions(1920, 1080, 1.25);
  assert.strictEqual(dims.captureWidth, 2400);
  assert.strictEqual(dims.captureHeight, 1350);
});

suite.test('150% DPI scaling (scaleFactor 1.50) calculates high-resolution capture size', () => {
  const dims = calculateCaptureDimensions(1920, 1080, 1.5);
  assert.strictEqual(dims.captureWidth, 2880);
  assert.strictEqual(dims.captureHeight, 1620);
});

suite.test('200% DPI scaling (scaleFactor 2.0) calculates 4K capture size', () => {
  const dims = calculateCaptureDimensions(1920, 1080, 2.0);
  assert.strictEqual(dims.captureWidth, 3840);
  assert.strictEqual(dims.captureHeight, 2160);
});

suite.test('Odd and fractional scale factors always round to integer pixel dimensions', () => {
  const testScales = [1.1, 1.333, 1.667, 1.75, 2.25, 2.75, 3.5];
  for (const sf of testScales) {
    const dims = calculateCaptureDimensions(1920, 1080, sf);
    assert.ok(Number.isInteger(dims.captureWidth), `captureWidth must be integer for scaleFactor ${sf}`);
    assert.ok(Number.isInteger(dims.captureHeight), `captureHeight must be integer for scaleFactor ${sf}`);
    assert.ok(dims.captureWidth > 1920, `captureWidth must scale up for scaleFactor ${sf}`);
  }
});

suite.test('Aspect ratio is preserved within 0.005 tolerance across DPI scales', () => {
  const originalAspect = 1920 / 1080;
  const testScales = [1.0, 1.25, 1.5, 1.75, 2.0, 2.5];
  for (const sf of testScales) {
    const { captureWidth, captureHeight } = calculateCaptureDimensions(1920, 1080, sf);
    const scaledAspect = captureWidth / captureHeight;
    const diff = Math.abs(scaledAspect - originalAspect);
    assert.ok(diff < 0.005, `Aspect ratio difference ${diff} exceeds tolerance at scale ${sf}`);
  }
});

suite.test('Primary display query matches high-DPI capture math', () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  assert.ok(primaryDisplay, 'Primary display must be detected');
  assert.ok(primaryDisplay.size.width > 0, 'Display width must be positive');
  assert.ok(primaryDisplay.size.height > 0, 'Display height must be positive');

  const sf = primaryDisplay.scaleFactor || 1;
  assert.ok(sf >= 1.0, 'Scale factor must be >= 1.0');

  const { captureWidth, captureHeight } = calculateCaptureDimensions(
    primaryDisplay.size.width,
    primaryDisplay.size.height,
    sf
  );

  assert.strictEqual(captureWidth, Math.round(primaryDisplay.size.width * sf));
  assert.strictEqual(captureHeight, Math.round(primaryDisplay.size.height * sf));
});

app.whenReady().then(async () => {
  const success = await suite.run();
  app.exit(success ? 0 : 1);
});
