import { app, BrowserWindow } from 'electron';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { DEFAULT_SETTINGS } from '../../src/main/store.js';
import { applyWindowState, hideWindow, restoreWindow } from '../../src/main/window-state.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';
const suite = createTestSuite('Opaque overlay composition and transparency compatibility');
let win;
function layered() {
  const handle = win.getNativeWindowHandle();
  const hwnd = handle.length >= 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE());
  const result = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.resolve('tests/stress/win32_query.ps1'), String(hwnd)], {encoding: 'utf8', windowsHide: true, timeout: 15000}));
  return (BigInt(result.ExStyle) & 0x80000n) !== 0n;
}
suite.test('Fresh default overlay avoids Windows layered composition through hide/show cycles', async () => {
  win = new BrowserWindow({show:false, frame:false, transparent:false, backgroundColor:'#0d0f14', webPreferences:{sandbox:true,contextIsolation:true}});
  await win.loadURL('about:blank');
  applyWindowState(win, DEFAULT_SETTINGS);
  assert.equal(win.getOpacity(), 1);
  if (process.platform === 'win32') assert.equal(layered(), false);
  for (let index=0; index<10; index++) {
    restoreWindow(win, DEFAULT_SETTINGS);
    hideWindow(win);
    assert.equal(win.isVisible(), false);
  }
  if (process.platform === 'win32') assert.equal(layered(), false);
});
suite.test('Click-through returns to opaque composition and custom transparency still works', () => {
  applyWindowState(win, {...DEFAULT_SETTINGS,clickThrough:true});
  if (process.platform === 'win32') assert.equal(layered(), true);
  applyWindowState(win, {...DEFAULT_SETTINGS,clickThrough:false});
  if (process.platform === 'win32') assert.equal(layered(), false);
  applyWindowState(win, {...DEFAULT_SETTINGS,opacity:.65});
  assert.ok(Math.abs(win.getOpacity()-.65)<.001);
  if (process.platform === 'win32') assert.equal(layered(), true);
  // Electron keeps the layered flag after opacity has been used. A fresh
  // opaque window, rather than a silent restart of a chat, avoids that path.
  applyWindowState(win, {...DEFAULT_SETTINGS,opacity:1});
  assert.equal(win.getOpacity(), 1);
  if (process.platform === 'win32') assert.equal(layered(), true);
});
app.whenReady().then(async () => {
  const success = await suite.run();
  win?.destroy();
  app.exit(success ? 0 : 1);
});
