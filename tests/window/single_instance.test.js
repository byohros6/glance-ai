import { app, BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suite = createTestSuite('Tier 2: Single Instance Lock Enforcement');

let win = null;

suite.test('Primary process acquires single instance lock', () => {
  const gotLock = app.requestSingleInstanceLock();
  assert.strictEqual(gotLock, true, 'Primary process must obtain the single instance lock');
});

suite.test('Second instance notifies primary and terminates', async () => {
  win = new BrowserWindow({ show: false });

  let secondInstanceReceived = false;
  app.on('second-instance', (_event, _argv, _cwd) => {
    secondInstanceReceived = true;
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });

  const helperPath = path.join(__dirname, '../fixtures/second_instance_helper.js');
  const child = spawn(process.execPath, [helperPath], {
    stdio: 'ignore'
  });

  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code) => resolve(code));
  });

  // Second instance must have failed to get the lock (code 42)
  assert.strictEqual(exitCode, 42, 'Second instance must fail to acquire lock and exit');

  // Wait a moment for primary instance to process event
  await new Promise((r) => setTimeout(r, 400));
  assert.strictEqual(secondInstanceReceived, true, 'Primary instance must receive second-instance event');
});

app.whenReady().then(async () => {
  try {
    const success = await suite.run();
    if (win && !win.isDestroyed()) {
      win.close();
    }
    app.releaseSingleInstanceLock();
    app.exit(success ? 0 : 1);
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
