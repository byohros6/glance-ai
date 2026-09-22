import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { applyWindowState } from '../../src/main/window-state.js';
import { SettingsStore, DEFAULT_SETTINGS } from '../../src/main/store.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suite = createTestSuite('Empirical Challenger: Milestone 1 Interactive Hardening');

let bgWin = null;
let overlayWin = null;
let testStore = null;
const testStorePath = path.join(os.tmpdir(), 'temp_concurrency_store.json');
const mouseEventsCalls = [];

suite.test('Non-Activating Focus Mode: focus does not leak to overlay on click or programmatic focus', async () => {
  // Clean up any temp store
  if (fs.existsSync(testStorePath)) fs.unlinkSync(testStorePath);
  testStore = new SettingsStore(testStorePath);

  // 1. Create a simulated background application window (e.g. IDE, editor, game)
  bgWin = new BrowserWindow({
    show: true,
    focusable: true,
    title: 'Background Active App'
  });
  bgWin.focus();
  await new Promise((r) => setTimeout(r, 150));
  assert.strictEqual(bgWin.isFocused(), true, 'Background window must initially hold active OS focus');

  // 2. Initialize Overlay BrowserWindow in non-activating mode (focusable: false)
  overlayWin = new BrowserWindow({
    show: true,
    focusable: false,
    type: 'toolbar',
    webPreferences: {
      preload: path.join(__dirname, '../../src/preload/preload.cjs'),
      additionalArguments: ['--glance-test-api'],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  await new Promise((r) => setTimeout(r, 150));

  assert.strictEqual(overlayWin.isFocusable(), false, 'Overlay must report isFocusable() === false');
  assert.strictEqual(overlayWin.isFocused(), false, 'Overlay must NOT gain focus on creation');
  assert.strictEqual(bgWin.isFocused(), true, 'Background app must retain focus when overlay is opened');

  // 3. Attempt programmatic focus on non-focusable overlay
  overlayWin.focus();
  await new Promise((r) => setTimeout(r, 100));
  assert.strictEqual(overlayWin.isFocused(), false, 'Overlay.focus() must not steal focus in non-activating mode');
  assert.strictEqual(bgWin.isFocused(), true, 'Background app must retain focus after overlay.focus() attempt');

  // 4. Send direct mouse click into overlay window
  overlayWin.webContents.sendInputEvent({
    type: 'mouseDown',
    x: 100,
    y: 100,
    button: 'left',
    clickCount: 1
  });
  overlayWin.webContents.sendInputEvent({
    type: 'mouseUp',
    x: 100,
    y: 100,
    button: 'left',
    clickCount: 1
  });
  await new Promise((r) => setTimeout(r, 150));

  assert.strictEqual(overlayWin.isFocused(), false, 'Overlay must NOT steal focus upon receiving mouse click');
  assert.strictEqual(bgWin.isFocused(), true, 'Background app must retain focus after clicking on overlay');

  // 5. Toggle overlay to focusable: true (interactive mode)
  overlayWin.setFocusable(true);
  assert.strictEqual(overlayWin.isFocusable(), true, 'Overlay must report isFocusable() === true');
  overlayWin.focus();
  await new Promise((r) => setTimeout(r, 150));
  assert.strictEqual(overlayWin.isFocused(), true, 'Overlay must gain focus when focusable is enabled');
  assert.strictEqual(bgWin.isFocused(), false, 'Background app loses focus when overlay is focused interactively');

  // 6. Toggle overlay back to focusable: false (non-activating mode)
  applyWindowState(overlayWin, { ...DEFAULT_SETTINGS, focusable: false });
  bgWin.focus();
  await new Promise((r) => setTimeout(r, 150));
  assert.strictEqual(overlayWin.isFocusable(), false, 'Overlay is non-activating again');
  assert.strictEqual(overlayWin.isFocused(), false, 'Disabling interaction must release overlay focus');
  // Windows chooses the foreground destination when an active window becomes
  // non-activating. It may choose another desktop app, and may reject focus().
  // Verify our promise: subsequent overlay clicks do not change that choice.
  const backgroundFocusedAfterToggle = bgWin.isFocused();

  // 7. Click overlay again to verify non-activating stealth holds
  overlayWin.webContents.sendInputEvent({
    type: 'mouseDown',
    x: 50,
    y: 50,
    button: 'left',
    clickCount: 1
  });
  overlayWin.webContents.sendInputEvent({
    type: 'mouseUp',
    x: 50,
    y: 50,
    button: 'left',
    clickCount: 1
  });
  await new Promise((r) => setTimeout(r, 150));
  assert.strictEqual(overlayWin.isFocused(), false, 'Overlay still does NOT steal focus on click');
  assert.strictEqual(bgWin.isFocused(), backgroundFocusedAfterToggle, 'Overlay clicks preserve the background focus state');

  // 8. Stress-test rapid toggling (100 rapid toggles)
  let focusState = false;
  for (let i = 0; i < 100; i++) {
    focusState = !focusState;
    overlayWin.setFocusable(focusState);
  }
  assert.strictEqual(overlayWin.isFocusable(), focusState, 'Focusable state remains deterministic after 100 rapid toggles');

  // Hide background app to continue cleanly
  bgWin.hide();
  overlayWin.hide();
});

suite.test('Click-Through Mode: mouse events forwarded on body, captured on toolbar hover & settings modal', async () => {
  mouseEventsCalls.length = 0;

  // Set up mock IPC handlers matching src/main/main.js
  ipcMain.removeHandler('set-ignore-mouse-events');
  ipcMain.removeHandler('get-click-through');
  ipcMain.removeHandler('set-click-through');
  ipcMain.removeHandler('get-focusable');
  ipcMain.removeHandler('set-focusable');
  ipcMain.removeHandler('get-settings');
  ipcMain.removeHandler('save-settings');

  ipcMain.handle('set-ignore-mouse-events', (_event, ignore, options) => {
    mouseEventsCalls.push({ ignore, options });
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.setIgnoreMouseEvents(ignore, options);
    }
    return true;
  });

  ipcMain.handle('get-click-through', () => testStore.get('clickThrough'));
  ipcMain.handle('set-click-through', (_event, val) => {
    testStore.set('clickThrough', val);
    if (val) {
      mouseEventsCalls.push({ ignore: true, options: { forward: true } });
    } else {
      mouseEventsCalls.push({ ignore: false, options: undefined });
    }
    return val;
  });

  ipcMain.handle('get-focusable', () => testStore.get('focusable'));
  ipcMain.handle('set-focusable', (_event, val) => {
    testStore.set('focusable', val);
    return val;
  });

  ipcMain.handle('get-settings', () => testStore.getAll());
  ipcMain.handle('save-settings', (_event, s) => {
    testStore.update(s);
    return testStore.getAll();
  });

  // Enable click-through
  testStore.set('clickThrough', true);

  const fixturePath = path.join(__dirname, '../fixtures/gemini_mock.html');
  await overlayWin.loadFile(fixturePath);
  await new Promise((r) => setTimeout(r, 200));

  overlayWin.webContents.send('action:click-through-changed', true);
  await new Promise((r) => setTimeout(r, 50));
  mouseEventsCalls.length = 0;

  // Subtest A: Toolbar Hover interaction
  const hoverToolbar = await overlayWin.webContents.executeJavaScript(`
    (() => {
      const tb = document.getElementById('glance-toolbar');
      if (!tb) return false;
      tb.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      return true;
    })()
  `);
  assert.strictEqual(hoverToolbar, true, 'Toolbar #glance-toolbar must exist in DOM');
  await new Promise((r) => setTimeout(r, 100));

  assert.ok(mouseEventsCalls.length > 0, 'Must invoke set-ignore-mouse-events on toolbar hover');
  const lastCallHover = mouseEventsCalls[mouseEventsCalls.length - 1];
  assert.strictEqual(lastCallHover.ignore, false, 'Toolbar hover must set ignore=false to capture mouse clicks');

  // Subtest B: Toolbar Mouseleave interaction restores click-through with forward: true
  await overlayWin.webContents.executeJavaScript(`
    (() => {
      const tb = document.getElementById('glance-toolbar');
      tb.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    })()
  `);
  await new Promise((r) => setTimeout(r, 100));

  const lastCallLeave = mouseEventsCalls[mouseEventsCalls.length - 1];
  assert.strictEqual(lastCallLeave.ignore, true, 'Leaving toolbar must restore ignore=true');
  assert.deepStrictEqual(lastCallLeave.options, { forward: true }, 'Leaving toolbar must pass { forward: true } for OS click-through');

  // Subtest C: Settings Modal Interaction
  // Open modal via settings button
  await overlayWin.webContents.executeJavaScript(`
    (() => {
      const settingsBtn = document.getElementById('glance-settings-btn');
      settingsBtn.click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 150));

  // Verify modal is open and mouse events are un-ignored
  const modalState = await overlayWin.webContents.executeJavaScript(`
    (() => {
      const modal = document.getElementById('glance-modal-overlay');
      return {
        exists: !!modal,
        hasDashboardControl: !!modal?.querySelector('#modal-dashboard-btn')
      };
    })()
  `);
  assert.strictEqual(modalState.exists, true, 'Hotkeys modal must be open');
  assert.strictEqual(modalState.hasDashboardControl, true, 'Hotkeys modal provides access to settings');

  const modalOpenCall = mouseEventsCalls[mouseEventsCalls.length - 1];
  assert.strictEqual(modalOpenCall.ignore, false, 'Opening settings modal must set ignore=false to capture clicks');

  // Subtest D: While modal is open, mouse leaving toolbar must NOT re-enable click-through
  mouseEventsCalls.length = 0;
  await overlayWin.webContents.executeJavaScript(`
    (() => {
      const tb = document.getElementById('glance-toolbar');
      tb.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    })()
  `);
  await new Promise((r) => setTimeout(r, 100));

  const reenabledWhileModalOpen = mouseEventsCalls.some((c) => c.ignore === true);
  assert.strictEqual(reenabledWhileModalOpen, false, 'Leaving toolbar while modal is open must NOT re-enable click-through');

  // Subtest E: Close modal restores click-through
  await overlayWin.webContents.executeJavaScript(`
    (() => {
      const closeBtn = document.getElementById('modal-close');
      closeBtn.click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 100));

  const modalClosed = await overlayWin.webContents.executeJavaScript(`
    !document.getElementById('glance-modal-overlay')
  `);
  assert.strictEqual(modalClosed, true, 'Modal should be closed');

  const afterCloseCall = mouseEventsCalls[mouseEventsCalls.length - 1];
  assert.strictEqual(afterCloseCall.ignore, true, 'Closing modal must restore ignore=true');
  assert.deepStrictEqual(afterCloseCall.options, { forward: true }, 'Closing modal must restore forward: true');

  // Subtest F: Rapid hover oscillation stress (50 cycles)
  for (let i = 0; i < 50; i++) {
    await overlayWin.webContents.executeJavaScript(`
      (() => {
        const tb = document.getElementById('glance-toolbar');
        tb.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        tb.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      })()
    `);
  }
  await new Promise((r) => setTimeout(r, 150));
  const finalCall = mouseEventsCalls[mouseEventsCalls.length - 1];
  assert.strictEqual(finalCall.ignore, true, 'Final state after hover oscillation must be ignore=true');
  assert.deepStrictEqual(finalCall.options, { forward: true }, 'Final state options must be { forward: true }');
});

suite.test('Store Concurrency: rapid setBounds debounce properly without disk corruption', async () => {
  const storeFile = path.join(os.tmpdir(), 'temp_burst_store.json');
  if (fs.existsSync(storeFile)) fs.unlinkSync(storeFile);

  const burstStore = new SettingsStore(storeFile);

  // 1. Rapid burst of 500 setBounds calls within milliseconds
  const burstCount = 500;
  for (let i = 0; i < burstCount; i++) {
    burstStore.setBounds({
      x: 100 + (i % 300),
      y: 50 + (i % 200),
      width: 520 + (i % 100),
      height: 650 + (i % 100)
    });
  }

  // Immediately check in-memory state: must match the 500th update
  const expectedLast = {
    x: 100 + ((burstCount - 1) % 300),
    y: 50 + ((burstCount - 1) % 200),
    width: 520 + ((burstCount - 1) % 100),
    height: 650 + ((burstCount - 1) % 100)
  };

  assert.strictEqual(burstStore.get('x'), expectedLast.x, 'In-memory x should match final update');
  assert.strictEqual(burstStore.get('y'), expectedLast.y, 'In-memory y should match final update');
  assert.strictEqual(burstStore.get('windowWidth'), expectedLast.width, 'In-memory width should match final update');
  assert.strictEqual(burstStore.get('windowHeight'), expectedLast.height, 'In-memory height should match final update');

  // 2. Verify debounce: immediately after burst, file on disk shouldn't have experienced 500 atomic renames
  // Wait 350ms (debounce is 250ms) to allow debounced write to complete
  await new Promise((r) => setTimeout(r, 350));

  assert.ok(fs.existsSync(storeFile), 'Store file must exist on disk after debounce delay');
  const rawDisk = fs.readFileSync(storeFile, 'utf-8');
  let parsedDisk = null;
  assert.doesNotThrow(() => {
    parsedDisk = JSON.parse(rawDisk);
  }, 'Disk store file must contain 100% valid, uncorrupted JSON');

  assert.strictEqual(parsedDisk.x, expectedLast.x, 'Persisted disk x must match final burst coordinates');
  assert.strictEqual(parsedDisk.y, expectedLast.y, 'Persisted disk y must match final burst coordinates');
  assert.strictEqual(parsedDisk.windowWidth, expectedLast.width, 'Persisted disk width must match final burst dimensions');
  assert.strictEqual(parsedDisk.windowHeight, expectedLast.height, 'Persisted disk height must match final burst dimensions');

  // 3. Asynchronous concurrent write stress: 50 concurrent async tasks
  const asyncTasks = [];
  for (let j = 0; j < 50; j++) {
    asyncTasks.push(
      new Promise((resolve) => {
        setTimeout(() => {
          burstStore.setBounds({ x: 200 + j, y: 150 + j, width: 600, height: 700 });
          burstStore.set('opacity', 0.5 + (j % 5) * 0.1);
          resolve();
        }, Math.floor(Math.random() * 20));
      })
    );
  }
  await Promise.all(asyncTasks);

  // Flush to force disk write immediately
  burstStore.flush();

  const diskAfterConcurrent = fs.readFileSync(storeFile, 'utf-8');
  assert.doesNotThrow(() => {
    JSON.parse(diskAfterConcurrent);
  }, 'Store file on disk must remain completely uncorrupted under concurrent async writes');

  // 4. Boundary & invalid inputs: ensure store handles degenerate inputs gracefully
  burstStore.setBounds({ x: NaN, y: Infinity, width: -100, height: 50 });
  // Negative or degenerate dimensions must be ignored (defaults preserved)
  assert.ok(burstStore.get('windowWidth') >= 200, 'Width < 200 must be ignored or clamped >= 200');
  assert.ok(burstStore.get('windowHeight') >= 200, 'Height < 200 must be ignored or clamped >= 200');

  // Cancel any pending debounced save timer so it does not write to disk after unlink
  if (burstStore._saveTimer) {
    clearTimeout(burstStore._saveTimer);
    burstStore._saveTimer = null;
  }

  // Cleanup
  if (fs.existsSync(storeFile)) fs.unlinkSync(storeFile);
});

suite.test('Simultaneous Focus & Click-Through IPC interleaving and Store rapid serialization stress', async () => {
  // Rapidly interleave focus and click-through toggles with simultaneous bounds updates
  const testFile = path.join(os.tmpdir(), 'temp_interleaving_store.json');
  if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  const interleaveStore = new SettingsStore(testFile);

  const iterations = 60;
  for (let i = 0; i < iterations; i++) {
    const isFocus = i % 2 === 0;
    const isClickThrough = i % 3 === 0;

    // Toggle window focusable
    overlayWin.setFocusable(isFocus);
    interleaveStore.set('focusable', isFocus);

    // Toggle click through
    if (isClickThrough) {
      overlayWin.setIgnoreMouseEvents(true, { forward: true });
    } else {
      overlayWin.setIgnoreMouseEvents(false);
    }
    interleaveStore.set('clickThrough', isClickThrough);

    // Concurrent setBounds updates
    interleaveStore.setBounds({
      x: 10 + i * 2,
      y: 20 + i * 2,
      width: 520 + (i % 20),
      height: 650 + (i % 20)
    });
  }

  // Force synchronous flush to disk
  interleaveStore.flush();

  // Verify disk integrity immediately
  assert.ok(fs.existsSync(testFile), 'Store file must exist after flush');
  const rawContent = fs.readFileSync(testFile, 'utf-8');
  assert.doesNotThrow(() => {
    const data = JSON.parse(rawContent);
    assert.strictEqual(typeof data.focusable, 'boolean', 'focusable must be boolean');
    assert.strictEqual(typeof data.clickThrough, 'boolean', 'clickThrough must be boolean');
    assert.strictEqual(data.x, 10 + (iterations - 1) * 2, 'x must match final iteration');
    assert.strictEqual(data.y, 20 + (iterations - 1) * 2, 'y must match final iteration');
  }, 'Interleaved store file must remain valid and uncorrupted');

  // Verify overlayWin state is consistent
  assert.strictEqual(
    overlayWin.isFocusable(),
    (iterations - 1) % 2 === 0,
    'Window focusable state must match final toggle'
  );

  if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
});

app.whenReady().then(async () => {
  try {
    const success = await suite.run();
    if (bgWin && !bgWin.isDestroyed()) bgWin.destroy();
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.destroy();
    if (testStorePath && fs.existsSync(testStorePath)) {
      try { fs.unlinkSync(testStorePath); } catch (e) {}
    }
    app.exit(success ? 0 : 1);
  } catch (err) {
    console.error('Test runner fatal error:', err);
    app.exit(1);
  }
});
