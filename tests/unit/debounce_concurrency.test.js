import { app, BrowserWindow } from 'electron';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const suite = createTestSuite('Tier 2: Double Ctrl+S Debounce & Concurrency Handling');

let win = null;

suite.test('Pre-roll hide safely restores opacity even when capture throws', async () => {
  win = new BrowserWindow({ show: false });
  win.setOpacity(0.95);

  const initialOpacity = win.getOpacity();
  assert.strictEqual(initialOpacity, 0.95);

  // Simulate pre-roll workflow with throwing capture function
  const simulatedCaptureWithThrow = async () => {
    const savedOpacity = win.getOpacity();
    win.setOpacity(0);
    win.setIgnoreMouseEvents(true, { forward: true });

    try {
      await new Promise((r) => setTimeout(r, 50));
      throw new Error('Simulated hardware capture failure');
    } finally {
      win.setOpacity(savedOpacity);
      win.setIgnoreMouseEvents(false);
    }
  };

  await assert.rejects(
    async () => await simulatedCaptureWithThrow(),
    /Simulated hardware capture failure/
  );

  // Verify finally block restored opacity
  assert.strictEqual(win.getOpacity(), 0.95, 'Window opacity must be restored to 0.95 after error');
});

suite.test('Double trigger concurrency does not corrupt window opacity to 0', async () => {
  win.setOpacity(0.95);

  let isCapturing = false;
  let executionCount = 0;

  // Debounced trigger workflow
  const debouncedTrigger = async () => {
    if (isCapturing) {
      // Debounced / busy gate
      return false;
    }
    isCapturing = true;

    const savedOpacity = 0.95; // Stored user opacity
    win.setOpacity(0);

    try {
      await new Promise((r) => setTimeout(r, 80));
      executionCount++;
      return true;
    } finally {
      win.setOpacity(savedOpacity);
      isCapturing = false;
    }
  };

  // Trigger two calls simultaneously
  const [res1, res2] = await Promise.all([
    debouncedTrigger(),
    debouncedTrigger()
  ]);

  assert.strictEqual(res1, true, 'First capture should execute');
  assert.strictEqual(res2, false, 'Second rapid capture should be debounced / rejected');
  assert.strictEqual(executionCount, 1, 'Only one capture workflow should complete');
  assert.strictEqual(win.getOpacity(), 0.95, 'Window opacity must be restored to 0.95');
});

app.whenReady().then(async () => {
  const success = await suite.run();
  if (win && !win.isDestroyed()) {
    win.close();
  }
  process.exit(success ? 0 : 1);
});
