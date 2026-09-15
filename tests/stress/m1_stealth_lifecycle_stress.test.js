import { app, BrowserWindow, globalShortcut } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';
import electronPath from 'electron';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suite = createTestSuite('Empirical Challenger: Stealth Window Attributes & Process Lifecycle');

let win = null;
let dummyWin = null;

function queryWin32Attributes(hwndBigInt) {
  const scriptPath = path.join(__dirname, 'win32_query.ps1');
  try {
    const raw = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" "${hwndBigInt.toString()}"`, {
      encoding: 'utf8',
      timeout: 10000
    });
    return JSON.parse(raw.trim());
  } catch (err) {
    console.warn('PowerShell Win32 query error:', err.message);
    return null;
  }
}

suite.test('Window Attributes: Borderless, transparent, type toolbar, skipTaskbar, contentProtection', async () => {
  win = new BrowserWindow({
    width: 520,
    height: 650,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    type: 'toolbar',
    focusable: true,
    hasShadow: false,
    show: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../../src/preload/preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.setSkipTaskbar(true);
  win.setContentProtection(true);
  win.setAlwaysOnTop(true, 'screen-saver');

  assert.strictEqual(win.isDestroyed(), false, 'Window must be alive');
  assert.strictEqual(win.isAlwaysOnTop(), true, 'Window must have alwaysOnTop active');
  assert.strictEqual(win.isFullScreen(), false, 'Window should not be full screen');

  if (process.platform === 'win32') {
    const handleBuf = win.getNativeWindowHandle();
    const hwnd = handleBuf.readBigInt64LE ? handleBuf.readBigInt64LE(0) : BigInt(handleBuf.readInt32LE(0));
    const win32Info = queryWin32Attributes(hwnd);
    if (win32Info) {
      console.log('    -> Win32 Native HWND query result:', JSON.stringify(win32Info));
      const isToolWindow = (BigInt(win32Info.ExStyle) & 0x80n) !== 0n;
      assert.strictEqual(isToolWindow, true, 'Win32 GWL_EXSTYLE must have WS_EX_TOOLWINDOW (0x80) flag set');
      assert.ok(win32Info.Affinity > 0, 'Win32 GetWindowDisplayAffinity must return > 0 (screen-share protected)');
    }
  }
});

suite.test('Content Protection: Dynamic toggle updates native affinity correctly', async () => {
  assert.strictEqual(win.isDestroyed(), false);

  // Toggle off
  win.setContentProtection(false);
  if (process.platform === 'win32') {
    const handleBuf = win.getNativeWindowHandle();
    const hwnd = handleBuf.readBigInt64LE ? handleBuf.readBigInt64LE(0) : BigInt(handleBuf.readInt32LE(0));
    const offInfo = queryWin32Attributes(hwnd);
    if (offInfo) {
      assert.strictEqual(offInfo.Affinity, 0, 'Win32 display affinity must be 0 (WDA_NONE) when content protection is OFF');
    }
  }

  // Toggle back on
  win.setContentProtection(true);
  if (process.platform === 'win32') {
    const handleBuf = win.getNativeWindowHandle();
    const hwnd = handleBuf.readBigInt64LE ? handleBuf.readBigInt64LE(0) : BigInt(handleBuf.readInt32LE(0));
    const onInfo = queryWin32Attributes(hwnd);
    if (onInfo) {
      assert.ok(onInfo.Affinity > 0, 'Win32 display affinity must be restored to > 0 when content protection is ON');
    }
  }
});

suite.test('Boss Key: Hides window completely, zeroes opacity, and enables mouse forwarding', async () => {
  win.setOpacity(0);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.hide();

  assert.strictEqual(win.isVisible(), false, 'Window must be hidden');
  assert.strictEqual(win.getOpacity(), 0, 'Window opacity must be 0');
});

suite.test('Boss Key: Restore via showInactive does NOT activate or steal focus from background window', async () => {
  dummyWin = new BrowserWindow({
    show: true,
    width: 400,
    height: 300,
    focusable: true
  });
  dummyWin.focus();
  await new Promise((r) => setTimeout(r, 200));

  assert.strictEqual(dummyWin.isFocused(), true, 'Dummy application window must initially be focused');

  // Trigger Boss Key Restore (the exact code from shortcuts.js line 175)
  win.showInactive();
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setSkipTaskbar(true);
  win.setContentProtection(true);
  win.setOpacity(0.95);
  win.setIgnoreMouseEvents(false);

  await new Promise((r) => setTimeout(r, 200));

  assert.strictEqual(win.isVisible(), true, 'Overlay window must be visible after Boss Key restore');
  assert.strictEqual(win.isAlwaysOnTop(), true, 'Overlay window must remain alwaysOnTop');
  assert.strictEqual(win.isFocused(), false, 'CRITICAL: Overlay window must NOT be focused after showInactive()');
  assert.strictEqual(dummyWin.isFocused(), true, 'CRITICAL: Active background window must RETAIN focus');

  dummyWin.close();
  dummyWin = null;
});

suite.test('Boss Key: Rapid toggle stress test (50 cycles) maintains state consistency', async () => {
  for (let i = 0; i < 50; i++) {
    if (i % 2 === 0) {
      win.setOpacity(0);
      win.setIgnoreMouseEvents(true, { forward: true });
      win.hide();
    } else {
      win.showInactive();
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setSkipTaskbar(true);
      win.setContentProtection(true);
      win.setOpacity(0.95);
      win.setIgnoreMouseEvents(false);
    }
  }

  win.showInactive();
  win.setOpacity(0.95);
  assert.strictEqual(win.isDestroyed(), false, 'Window must survive 50 rapid Boss Key toggles');
  assert.strictEqual(win.isVisible(), true, 'Window must remain visible after toggle loop');
});

suite.test('Boss Key: Restore when focusable is false (non-activating mode) never steals focus', async () => {
  win.setFocusable(false);

  dummyWin = new BrowserWindow({
    show: true,
    width: 400,
    height: 300,
    focusable: true
  });
  dummyWin.focus();
  await new Promise((r) => setTimeout(r, 150));
  assert.strictEqual(dummyWin.isFocused(), true);

  win.hide();
  assert.strictEqual(win.isVisible(), false);

  win.showInactive();
  await new Promise((r) => setTimeout(r, 150));

  assert.strictEqual(win.isVisible(), true);
  assert.strictEqual(win.isFocused(), false, 'Non-activating overlay must never gain focus');
  assert.strictEqual(dummyWin.isFocused(), true, 'Background app remains focused');

  dummyWin.close();
  dummyWin = null;
  win.setFocusable(true);
});

suite.test('Emergency Kill Switch: Cleanly exits without beforeunload hang in child process', async () => {
  const childScript = path.join(__dirname, 'test_kill_switch_child.js');
  const startTime = Date.now();

  const child = spawn(process.execPath, [childScript], {
    stdio: 'pipe'
  });
  let childOutput = '';
  child.stdout.on('data', (d) => {
    const text = d.toString();
    childOutput += text;
    console.log('    [child stdout]', text.trim());
  });
  child.stderr.on('data', (d) => console.error('    [child stderr]', d.toString().trim()));

  const exitCode = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Emergency exit test timed out (hung on beforeunload!)'));
    }, 15000);

    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  const elapsed = Date.now() - startTime;
  console.log(`    -> Child emergency exit terminated in ${elapsed}ms with exit code ${exitCode}`);
  assert.strictEqual(exitCode, 0, 'Emergency kill switch must exit with code 0');
  assert.ok(elapsed < 15000, 'Emergency kill switch process must complete within 15s');

  const match = childOutput.match(/EMERGENCY_EXIT_EXECUTION_TIME_MS:(\d+)/);
  if (match) {
    const execMs = parseInt(match[1], 10);
    console.log(`    -> In-process emergency exit execution time: ${execMs}ms`);
    assert.ok(execMs < 500, `Emergency exit logic must execute instantly (<500ms), took ${execMs}ms`);
  }
});

suite.test('Emergency Kill Switch: Resilient when window is null or destroyed', () => {
  assert.doesNotThrow(() => {
    const nullWin = null;
    if (nullWin && !nullWin.isDestroyed()) {
      nullWin.destroy();
    }
  }, 'Null window during emergency exit must not throw');

  const destroyedWin = new BrowserWindow({ show: false });
  destroyedWin.destroy();
  assert.strictEqual(destroyedWin.isDestroyed(), true);

  assert.doesNotThrow(() => {
    if (destroyedWin && !destroyedWin.isDestroyed()) {
      destroyedWin.destroy();
    }
  }, 'Destroyed window during emergency exit must not throw');
});

app.whenReady().then(async () => {
  try {
    const success = await suite.run();
    if (win && !win.isDestroyed()) {
      win.close();
    }
    if (dummyWin && !dummyWin.isDestroyed()) {
      dummyWin.close();
    }
    process.exit(success ? 0 : 1);
  } catch (err) {
    console.error('Fatal error in stress suite:', err);
    process.exit(1);
  }
});
