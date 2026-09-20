import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyWindowState } from '../src/main/window-state.js';

async function main() {
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'glance-perf-'));
app.setPath('userData', profile);
app.on('window-all-closed', () => {});
await app.whenReady();
const settings = { opacity: .95, focusable: true, clickThrough: false, undetectable: true, shortcuts: {} };
for (const [channel, value] of [['get-settings', settings], ['get-focusable', true], ['get-click-through', false], ['set-ignore-mouse-events', true]]) ipcMain.handle(channel, () => value);
const win = new BrowserWindow({ width: 520, height: 650, frame: false, transparent: true, show: false, webPreferences: { preload: path.resolve('src/preload/preload.cjs'), sandbox: true, contextIsolation: true, additionalArguments: ['--glance-test-api'] } });
await win.loadFile(path.resolve('tests/fixtures/gemini_mock.html'));
applyWindowState(win, settings);
win.showInactive();
const calls = {};
for (const name of ['setOpacity', 'setFocusable', 'setIgnoreMouseEvents', 'setSkipTaskbar', 'setContentProtection', 'setAlwaysOnTop']) {
  const original = win[name].bind(win);
  win[name] = (...args) => { calls[name] = (calls[name] || 0) + 1; return original(...args); };
}
const start = performance.now();
for (let i = 0; i < 100; i++) applyWindowState(win, { ...settings, opacity: i % 2 ? .95 : .85 });
const nativeUpdatesMs = performance.now() - start;
await win.webContents.executeJavaScript(`(() => {
  const chat = document.querySelector('.conversation-container');
  chat.style.height = '250px'; chat.innerHTML = '<div style="height:20000px">Scroll benchmark</div>';
  chat.scrollTop = 0;
})()`);
for (let i = 0; i < 20; i++) win.webContents.send('action:scroll', 100);
await new Promise(resolve => setTimeout(resolve, 150));
const scrolledAt150ms = await win.webContents.executeJavaScript("document.querySelector('.conversation-container').scrollTop");
await new Promise(resolve => setTimeout(resolve, 600));
const finalScroll = await win.webContents.executeJavaScript("document.querySelector('.conversation-container').scrollTop");
const frameSamples = [];
for (const throttled of [true, false]) {
  win.webContents.setBackgroundThrottling(throttled);
  win.setFocusable(false);
  win.showInactive();
  const frames = await win.webContents.executeJavaScript(`new Promise(resolve => {
    const intervals = []; let last = performance.now();
    const frame = now => { intervals.push(now - last); last = now;
      if (intervals.length < 90) requestAnimationFrame(frame);
      else { intervals.sort((a,b) => a-b); resolve({visibility: document.visibilityState, medianMs: intervals[45], p95Ms: intervals[85], maxMs: intervals[89]}); }
    }; requestAnimationFrame(frame);
  })`);
  frameSamples.push({ throttled, ...frames });
}
const report = { nativeUpdatesMs, nativeCalls: calls, scroll: { requested: 2000, scrolledAt150ms, finalScroll }, unfocusedFrames: frameSamples, gpu: app.getGPUFeatureStatus(), note: 'Local fixture; native state, queued scroll and unfocused rendering measurements. Not a live-provider speed measurement.' };
await fs.writeFile(process.argv[2] || 'review/performance.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
win.destroy();
await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
app.exit(0);
}
main().catch(error => { console.error(error); app.exit(1); });
