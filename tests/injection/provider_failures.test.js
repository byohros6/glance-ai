import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'node:path';
import { createTestSuite, assert } from '../helpers/test_suite.js';
const suite = createTestSuite('Provider negative outcomes and untrusted-page isolation');
app.on('window-all-closed', () => {});
let win;
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
let privilegedCalls = 0;
for (const [name, result] of Object.entries({ 'get-settings': { shortcuts: {}, opacity: .95 }, 'get-focusable': true, 'get-click-through': false })) ipcMain.handle(name, () => result);
for (const name of ['capture-and-attach', 'submit-message', 'close-app', 'open-dashboard', 'set-ignore-mouse-events']) ipcMain.handle(name, () => { privilegedCalls++; return { ok: true }; });
async function load(provider = 'chatgpt') {
  if (win && !win.isDestroyed()) win.destroy();
  win = new BrowserWindow({ show: false, webPreferences: { preload: path.resolve('src/preload/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, additionalArguments: ['--glance-test-api'] } });
  await win.loadFile(path.resolve(`tests/fixtures/${provider}_mock.html`));
}
suite.test('Missing upload UI cannot report success', async () => {
  await load('gemini');
  assert.equal(await win.webContents.executeJavaScript(`(async () => { document.body.innerHTML = ''; return window.upload.uploadScreenshotToGemini({dataUrl:${JSON.stringify(png)}, strategy:{ type:'triggerSequence', triggerSelectors:[], waitTimeoutMs:10 }}); })()`), false);
});
suite.test('Handled paste is delivered once; never followed by duplicate file injection', async () => {
  await load();
  const result = await win.webContents.executeJavaScript(`(async () => { const ok = await window.upload.uploadImage(${JSON.stringify(png)}); return {ok, pasted:!!window.__testEvents.pastedFile, injected:!!window.__testEvents.fileInjected, previews:document.querySelectorAll('[data-testid="attachment"]').length}; })()`);
  assert.deepEqual(result, { ok: true, pasted: true, injected: false, previews: 1 });
});
suite.test('A dispatched click without a send outcome is not success', async () => {
  await load();
  await win.webContents.executeJavaScript("document.body.innerHTML = '<div id=\"prompt-textarea\" contenteditable=\"true\">unsent</div><button data-testid=\"send-button\">Send</button>'");
  assert.equal(await win.webContents.executeJavaScript('window.upload.submitPrompt()'), false);
});
suite.test('Keyboard fallback works when the provider has no send button and confirms submission', async () => {
  await load();
  const result = await win.webContents.executeJavaScript(`(async () => { document.getElementById('send-btn').remove(); await window.upload.uploadPrompt('keyboard submission'); return window.upload.submitPrompt(); })()`);
  assert.equal(result, true);
});
suite.test('Capture prompt preserves an existing draft', async () => {
  await load();
  const text = await win.webContents.executeJavaScript(`(async () => { document.getElementById('prompt-textarea').textContent='My original draft'; const ok=await window.upload.uploadPrompt('Template'); return {ok,text:document.getElementById('prompt-textarea').textContent}; })()`);
  assert.equal(text.ok, true); assert.ok(text.text.includes('My original draft')); assert.ok(text.text.includes('Template'));
});
suite.test('Pending uploads must finish before readiness is acknowledged', async () => {
  await load();
  const result = await win.webContents.executeJavaScript(`(async () => { window.__fixtureUploadDelay=450; const start=Date.now(); const ok=await window.upload.uploadImage(${JSON.stringify(png)}); return {ok,elapsed:Date.now()-start}; })()`);
  assert.equal(result.ok, true); assert.ok(result.elapsed >= 450);
});
suite.test('Real provider origin gets no page bridge and synthetic toolbar actions are ignored', async () => {
  win.destroy();
  await session.defaultSession.protocol.handle('https', () => new Response('<html><body><p>Provider page</p></body></html>', { headers: { 'content-type': 'text/html' } }));
  win = new BrowserWindow({ show: false, webPreferences: { preload: path.resolve('src/preload/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await win.loadURL('https://chatgpt.com/');
  privilegedCalls = 0;
  const result = await win.webContents.executeJavaScript(`(() => { for (const id of ['undec-snap-btn','undec-send-btn','undec-close-btn','undec-menu-btn']) document.getElementById(id)?.click(); return {bridge:typeof window.glanceai, legacy:typeof window.undecgpt, upload:typeof window.upload,toolbar:!!document.getElementById('undecgpt-toolbar')}; })()`);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual(result, { bridge: 'undefined', legacy: 'undefined', upload: 'undefined', toolbar: true });
  assert.equal(privilegedCalls, 0);
  session.defaultSession.protocol.unhandle('https');
});
app.whenReady().then(async () => { const ok = await suite.run(); win?.destroy(); app.exit(ok ? 0 : 1); });
