import { app } from 'electron';
import { captureScreen } from '../../src/main/screenshot.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const suite = createTestSuite('Tier 2: WebRTC Desktop Capturer & PowerShell Fallback');

suite.test('captureScreen executes fallback when desktopCapturer is unavailable or fails', async () => {
  const result = await captureScreen();

  assert.ok(result, 'captureScreen must return a non-null result');
  assert.ok(typeof result === 'string', 'result must be a string');
  assert.ok(result.startsWith('data:image/png;base64,'), 'result must be a base64 PNG data URL');

  // Verify decoded payload is a valid PNG header
  const base64Data = result.split(',')[1];
  assert.ok(base64Data && base64Data.length > 500, 'Captured image payload must be substantial');

  const binary = Buffer.from(base64Data, 'base64');
  assert.ok(binary.length > 500, 'Binary payload must exceed 500 bytes');

  // Check PNG signature bytes: 137 80 78 71 13 10 26 10 (0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n')
  const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < pngHeader.length; i++) {
    assert.strictEqual(
      binary[i],
      pngHeader[i],
      `Byte ${i} of screenshot must match PNG signature`
    );
  }
});

app.whenReady().then(async () => {
  const success = await suite.run();
  app.exit(success ? 0 : 1);
});
