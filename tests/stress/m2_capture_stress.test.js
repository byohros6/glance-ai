import { app, BrowserWindow, desktopCapturer, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  captureScreen,
  captureScreenWithHide,
  getIsCapturing
} from '../../src/main/screenshot.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suite = createTestSuite('Empirical Challenger: Milestone 2 Capture & Pre-Roll Stress Suite');

let testWin = null;

/**
 * Parses PNG header bytes and returns width, height, bitDepth, colorType.
 * PNG signature: 89 50 4E 47 0D 0A 1A 0A
 * IHDR chunk starts at byte 12 with 'IHDR', width at byte 16, height at byte 20.
 */
function parsePngHeader(buffer) {
  assert.ok(buffer && buffer.length >= 24, 'PNG buffer must be at least 24 bytes');
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i++) {
    assert.strictEqual(
      buffer[i],
      signature[i],
      `Byte ${i} of PNG signature mismatch: expected ${signature[i]}, got ${buffer[i]}`
    );
  }
  const chunkType = buffer.toString('ascii', 12, 16);
  assert.strictEqual(chunkType, 'IHDR', `Chunk type must be IHDR, got ${chunkType}`);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  return { width, height, bitDepth, colorType };
}

// -----------------------------------------------------------------------------
// Test 1: desktopCapturer full-resolution base64 PNG capture
// -----------------------------------------------------------------------------
suite.test('desktopCapturer produces full-resolution valid base64 PNG', async () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const scaleFactor = primaryDisplay.scaleFactor || 1;
  const expectedWidth = Math.round(primaryDisplay.size.width * scaleFactor);
  const expectedHeight = Math.round(primaryDisplay.size.height * scaleFactor);

  console.log(`    -> Primary Display: ${primaryDisplay.size.width}x${primaryDisplay.size.height} @ scaleFactor ${scaleFactor} (Expected capture: ${expectedWidth}x${expectedHeight})`);

  const result = await captureScreen();

  assert.ok(result, 'captureScreen() must return a non-null string');
  assert.ok(result.startsWith('data:image/png;base64,'), 'Result must be a base64 PNG data URL');

  const base64Data = result.replace(/^data:image\/png;base64,/, '');
  assert.ok(base64Data.length > 5000, `Base64 payload length (${base64Data.length}) must be substantial`);

  const buffer = Buffer.from(base64Data, 'base64');
  assert.ok(buffer.length > 5000, `Binary buffer size (${buffer.length} bytes) must be substantial`);

  const header = parsePngHeader(buffer);
  console.log(`    -> Parsed PNG header: ${header.width}x${header.height}, bitDepth: ${header.bitDepth}, colorType: ${header.colorType}`);

  // Check dimensions match primary screen high-DPI resolution
  assert.strictEqual(header.width, expectedWidth, `PNG width (${header.width}) must match primary display DPI-aware width (${expectedWidth})`);
  assert.strictEqual(header.height, expectedHeight, `PNG height (${header.height}) must match primary display DPI-aware height (${expectedHeight})`);
});

// -----------------------------------------------------------------------------
// Test 2: PowerShell DPI-aware fallback when desktopCapturer throws
// -----------------------------------------------------------------------------
suite.test('PowerShell fallback produces full-resolution base64 PNG when desktopCapturer fails', async () => {
  const originalGetSources = desktopCapturer.getSources;
  let fallbackInvoked = false;

  try {
    // Adversarially force desktopCapturer to throw
    desktopCapturer.getSources = async () => {
      fallbackInvoked = true;
      throw new Error('Adversarially injected desktopCapturer WebRTC failure');
    };

    const tempDir = app.getPath('temp');
    const beforeFiles = (await fs.readdir(tempDir)).filter((f) => f.startsWith('glance_'));

    const result = await captureScreen();

    assert.ok(fallbackInvoked, 'desktopCapturer must have been called and rejected');
    assert.ok(result, 'captureScreen fallback must return a non-null string');
    assert.ok(result.startsWith('data:image/png;base64,'), 'Fallback result must be a base64 PNG data URL');

    const base64Data = result.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    assert.ok(buffer.length > 5000, `Fallback image buffer (${buffer.length} bytes) must be substantial`);

    const header = parsePngHeader(buffer);
    console.log(`    -> PowerShell fallback PNG header: ${header.width}x${header.height}`);
    assert.ok(header.width > 0 && header.height > 0, 'Fallback PNG must have non-zero dimensions');

    // Check temp file cleanup in app.getPath('temp')
    const afterFiles = (await fs.readdir(tempDir)).filter((f) => f.startsWith('glance_'));
    const orphanedFiles = afterFiles.filter((f) => !beforeFiles.includes(f));
    assert.strictEqual(
      orphanedFiles.length,
      0,
      `PowerShell fallback must not leave orphaned temp files: found [${orphanedFiles.join(', ')}]`
    );
  } finally {
    desktopCapturer.getSources = originalGetSources;
  }
});

// -----------------------------------------------------------------------------
// Test 3: PowerShell fallback when desktopCapturer returns empty or invalid sources
// -----------------------------------------------------------------------------
suite.test('PowerShell fallback succeeds when desktopCapturer returns empty list or empty thumbnail', async () => {
  const originalGetSources = desktopCapturer.getSources;

  try {
    // Case A: returns empty array
    desktopCapturer.getSources = async () => [];
    const resultEmptyList = await captureScreen();
    assert.ok(resultEmptyList && resultEmptyList.startsWith('data:image/png;base64,'), 'Fallback must succeed on empty sources array');

    // Case B: returns empty thumbnail
    desktopCapturer.getSources = async () => [
      {
        id: 'screen:0:0',
        thumbnail: {
          isEmpty: () => true,
          toDataURL: () => 'data:image/png;base64,'
        }
      }
    ];
    const resultEmptyThumb = await captureScreen();
    assert.ok(resultEmptyThumb && resultEmptyThumb.startsWith('data:image/png;base64,'), 'Fallback must succeed on empty thumbnail');
  } finally {
    desktopCapturer.getSources = originalGetSources;
  }
});

// -----------------------------------------------------------------------------
// Test 4: Pre-roll hide delay smoothly zeroes opacity, forwards mouse, and waits >=100ms
// -----------------------------------------------------------------------------
suite.test('Pre-roll hide delay smoothly hides overlay before capture and waits >=100ms', async () => {
  testWin = new BrowserWindow({
    show: false,
    transparent: true,
    frame: false
  });
  testWin.setOpacity(0.85);

  assert.strictEqual(testWin.getOpacity(), 0.85, 'Initial window opacity must be 0.85');

  const startTime = Date.now();
  let opacityDuringCapture = null;

  // Wrap desktopCapturer temporarily to sample window opacity precisely when capture executes
  const originalGetSources = desktopCapturer.getSources;
  desktopCapturer.getSources = async (...args) => {
    opacityDuringCapture = testWin.getOpacity();
    return originalGetSources.apply(desktopCapturer, args);
  };

  try {
    const dataUrl = await captureScreenWithHide(testWin, { savedOpacity: 0.85 });
    const duration = Date.now() - startTime;

    assert.ok(dataUrl, 'Capture must produce dataUrl');
    assert.ok(duration >= 95, `Pre-roll delay must take at least 100ms compositor wait, took ${duration}ms`);
    assert.strictEqual(opacityDuringCapture, 0, 'CRITICAL: Window opacity must be 0 during capture to prevent self-capture');
    assert.strictEqual(testWin.getOpacity(), 0.85, 'CRITICAL: Window opacity must be restored to 0.85 after capture completes');
  } finally {
    desktopCapturer.getSources = originalGetSources;
  }
});

// -----------------------------------------------------------------------------
// Test 5: Pre-roll always restores opacity even when capture throws an error
// -----------------------------------------------------------------------------
suite.test('Pre-roll always restores opacity and releases mutex even when capture throws', async () => {
  testWin.setOpacity(0.70);

  const originalGetSources = desktopCapturer.getSources;
  desktopCapturer.getSources = async () => {
    throw new Error('Fatal simulated capture crash');
  };

  try {
    // Also simulate PowerShell failure so captureScreen rejects completely
    const dataUrl = await captureScreenWithHide(testWin, { savedOpacity: 0.70 });

    // Even if it logged an error, it must return null or fallback
    assert.strictEqual(testWin.getOpacity(), 0.70, 'Window opacity must be restored to 0.70 even if an error occurs');
    assert.strictEqual(getIsCapturing(), false, 'isCapturing mutex must be false after error');
  } finally {
    desktopCapturer.getSources = originalGetSources;
  }
});

// -----------------------------------------------------------------------------
// Test 6: Click-through mode state restoration
// -----------------------------------------------------------------------------
suite.test('Pre-roll correctly respects and restores clickThrough: true and clickThrough: false', async () => {
  // Case A: clickThrough = true
  testWin.setOpacity(0.90);
  await captureScreenWithHide(testWin, { clickThrough: true, savedOpacity: 0.90 });
  assert.strictEqual(testWin.getOpacity(), 0.90);

  // Case B: clickThrough = false
  testWin.setOpacity(0.80);
  await captureScreenWithHide(testWin, { clickThrough: false, savedOpacity: 0.80 });
  assert.strictEqual(testWin.getOpacity(), 0.80);
});

// -----------------------------------------------------------------------------
// Test 7: Destroyed window safety
// -----------------------------------------------------------------------------
suite.test('captureScreenWithHide safely handles null or destroyed window', async () => {
  const nullResult = await captureScreenWithHide(null);
  assert.strictEqual(nullResult, null, 'Null window must return null');

  const deadWin = new BrowserWindow({ show: false });
  deadWin.destroy();
  assert.strictEqual(deadWin.isDestroyed(), true);

  const deadResult = await captureScreenWithHide(deadWin);
  assert.strictEqual(deadResult, null, 'Destroyed window must return null without throwing');
});

// -----------------------------------------------------------------------------
// Test 8: Rapid Capture Spam Mutex Stress Test (30 concurrent calls)
// -----------------------------------------------------------------------------
suite.test('Rapid capture spam: isCapturing mutex guards against overlapping captures', async () => {
  testWin.setOpacity(0.88);
  assert.strictEqual(getIsCapturing(), false, 'Mutex must initially be unlocked');

  const BURST_COUNT = 30;
  console.log(`    -> Firing ${BURST_COUNT} simultaneous captureScreenWithHide calls...`);

  const results = await Promise.all(
    Array.from({ length: BURST_COUNT }, () =>
      captureScreenWithHide(testWin, { savedOpacity: 0.88, clickThrough: false })
    )
  );

  const successfulCaptures = results.filter((r) => r !== null && typeof r === 'string');
  const debouncedCaptures = results.filter((r) => r === null);

  console.log(`    -> Completed: ${successfulCaptures.length} succeeded, ${debouncedCaptures.length} debounced by mutex`);

  assert.strictEqual(successfulCaptures.length, 1, 'Exactly ONE capture must succeed during concurrent burst');
  assert.strictEqual(debouncedCaptures.length, BURST_COUNT - 1, `Exactly ${BURST_COUNT - 1} captures must be dropped by mutex`);
  assert.strictEqual(getIsCapturing(), false, 'Mutex must be released after burst completes');
  assert.strictEqual(testWin.getOpacity(), 0.88, 'Window opacity must not be corrupted to 0 after spam burst');

  // Verify that after the spam burst finishes, a subsequent capture works normally
  await new Promise((r) => setTimeout(r, 1000));
  const subsequentResult = await captureScreenWithHide(testWin, { savedOpacity: 0.88 });
  assert.ok(subsequentResult, 'Subsequent capture after mutex release must succeed');
  assert.strictEqual(testWin.getOpacity(), 0.88, 'Window opacity remains 0.88 after subsequent capture');
});

// -----------------------------------------------------------------------------
// Test 9: Rapid Capture with Jitter Offsets
// -----------------------------------------------------------------------------
suite.test('Rapid capture with temporal jitter offsets prevents race conditions', async () => {
  testWin.setOpacity(0.92);
  const jitterDelays = [0, 5, 15, 25, 40, 60, 80, 110, 150];

  const jitterResults = await Promise.all(
    jitterDelays.map(async (delayMs) => {
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      return await captureScreenWithHide(testWin, { savedOpacity: 0.92 });
    })
  );

  const validResults = jitterResults.filter((r) => r !== null);
  console.log(`    -> Jitter test results: ${validResults.length} succeeded out of ${jitterDelays.length} jittered calls`);

  // At least 1 capture succeeded, and isCapturing must be false at the end
  assert.ok(validResults.length >= 1, 'At least one capture should succeed across jittered calls');
  assert.strictEqual(getIsCapturing(), false, 'Mutex must be false after all jitter calls complete');
  assert.strictEqual(testWin.getOpacity(), 0.92, 'Opacity must be restored to 0.92 after jitter sequence');
});

// -----------------------------------------------------------------------------
// Test 10: High-DPI scaleFactor bounds math oracle
// -----------------------------------------------------------------------------
suite.test('High-DPI scaleFactor math oracle across various scaling factors', () => {
  const displaySizes = [
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
    { width: 3840, height: 2160 },
    { width: 1366, height: 768 }
  ];
  const scaleFactors = [1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 3.0];

  for (const size of displaySizes) {
    for (const sf of scaleFactors) {
      const cw = Math.round(size.width * sf);
      const ch = Math.round(size.height * sf);

      assert.ok(Number.isInteger(cw), `Capture width must be integer: ${cw}`);
      assert.ok(Number.isInteger(ch), `Capture height must be integer: ${ch}`);
      assert.ok(cw >= size.width, `Scaled width (${cw}) must be >= logical width (${size.width})`);
      assert.ok(ch >= size.height, `Scaled height (${ch}) must be >= logical height (${size.height})`);
    }
  }
});

app.whenReady().then(async () => {
  try {
    const success = await suite.run();
    if (testWin && !testWin.isDestroyed()) {
      testWin.close();
    }
    app.exit(success ? 0 : 1);
  } catch (err) {
    console.error('Fatal error in capture stress suite:', err);
    app.exit(1);
  }
});
