import { app, globalShortcut, ipcMain, session, desktopCapturer, screen, nativeImage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createTestSuite, assert } from '../helpers/test_suite.js';
const suite = createTestSuite('Production entry point: isolation, settings, capture and recovery');
let main;
const handlers = new Map();
const shortcuts = new Map();
const realHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => { handlers.set(channel, handler); realHandle(channel, handler); };
globalShortcut.unregisterAll = () => shortcuts.clear();
globalShortcut.register = (key, callback) => { if (shortcuts.has(key) || key === 'Alt+F24') return false; shortcuts.set(key, callback); return true; };
globalShortcut.isRegistered = key => shortcuts.has(key);
async function until(predicate, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 30)); }
  throw new Error('Timed out waiting for app state');
}
function windows() { return main.getWindows(); }
async function dashboard(script) { return windows().dashboardWindow.webContents.executeJavaScript(script); }
suite.test('Ctrl+B opens the overlay once, with no privileged page bridge', async () => {
  shortcuts.get('CommandOrControl+B')();
  await until(async () => {
    const win = windows().overlayWindow;
    return win && !win.webContents.isLoading() && (await win.webContents.executeJavaScript('!!document.getElementById("undec-snap-btn")'));
  });
  assert.equal(windows().dashboardWindow.isVisible(), false);
  const win = windows().overlayWindow;
  assert.equal(win.isVisible(), true);
  assert.equal(await win.webContents.executeJavaScript('typeof window.glanceai'), 'undefined');
  if (process.env.GLANCE_TEST_SCREENSHOTS) await fs.writeFile(path.join(process.env.GLANCE_TEST_SCREENSHOTS, 'overlay.png'), (await win.webContents.capturePage()).toPNG());
});
suite.test('Dashboard round trip preserves conversation URL and draft, and remains interactive', async () => {
  const win = windows().overlayWindow;
  await win.webContents.executeJavaScript("history.pushState({}, '', '/app/a-conversation'); document.querySelector('.ql-editor').textContent = 'Keep this draft'");
  shortcuts.get('CommandOrControl+B')();
  await until(() => windows().dashboardWindow.isVisible());
  await dashboard('window.glanceai.saveSettings({clickThrough:true,focusable:false})');
  assert.equal(windows().dashboardWindow.isFocusable(), true);
  assert.equal(windows().dashboardWindow.getOpacity(), 1);
  await dashboard('window.glanceai.saveSettings({clickThrough:false,focusable:true})');
  shortcuts.get('CommandOrControl+B')();
  await until(() => win.isVisible());
  assert.ok(win.webContents.getURL().endsWith('/app/a-conversation'));
  assert.equal(await win.webContents.executeJavaScript("document.querySelector('.ql-editor').textContent"), 'Keep this draft');
});
suite.test('Hide and second-instance activation restore a visible, usable overlay', async () => {
  const win = windows().overlayWindow;
  shortcuts.get('CommandOrControl+H')(); await until(() => !win.isVisible());
  app.emit('second-instance');
  assert.equal(win.isVisible(), true); assert.ok(win.getOpacity() >= .15);
});
suite.test('Ctrl+B flushes dashboard edits before launching', async () => {
  main.showDashboard();
  await dashboard("queueSettings({prompt:'Saved before launch'});");
  shortcuts.get('CommandOrControl+B')();
  await until(() => windows().overlayWindow.isVisible());
  assert.equal(await dashboard('window.glanceai.getSettings().then(s => s.prompt)'), 'Saved before launch');
});
suite.test('Dashboard reflects focus and opacity changes made through overlay shortcuts', async () => {
  shortcuts.get('CommandOrControl+F')();
  shortcuts.get('CommandOrControl+[')();
  main.showDashboard();
  await until(async () => await dashboard("document.getElementById('toggle-focusable').checked === false && Number(document.getElementById('input-opacity').value) === .85"));
  await dashboard('window.glanceai.saveSettings({focusable:true,opacity:.95})');
  main.launchOverlay();
});
suite.test('Main IPC rejects unknown windows, subframes and wrong role', async () => {
  const win = windows().overlayWindow;
  assert.throws(() => handlers.get('capture-and-attach')({ sender: {}, senderFrame: { url: 'https://chatgpt.com/' } }), /not allowed/);
  assert.throws(() => handlers.get('capture-and-attach')({ sender: win.webContents, senderFrame: { url: win.webContents.getURL() } }), /not allowed/);
  assert.throws(() => handlers.get('save-settings')({ sender: win.webContents, senderFrame: win.webContents.mainFrame }, { prompt: 'malicious' }), /not allowed/);
});
suite.test('Send rebinding removes its old key; collision and OS failure roll back', async () => {
  main.showDashboard();
  await dashboard("window.glanceai.updateShortcut('send', 'Alt+Y')");
  assert.equal(shortcuts.has('CommandOrControl+Return'), false);
  assert.equal(shortcuts.has('CommandOrControl+Enter'), false);
  assert.equal(shortcuts.has('Alt+Y'), true);
  await assert.rejects(dashboard("window.glanceai.updateShortcut('emergencyExit', 'Ctrl+S')"), /conflict/);
  await assert.rejects(dashboard("window.glanceai.updateShortcut('send', 'Alt+F24')"), /unavailable/);
  assert.equal(shortcuts.has('Alt+Y'), true);
  await dashboard('window.glanceai.resetShortcuts()');
});
suite.test('Real toolbar capture and keyboard capture share verified attachment and auto-submit behavior', async () => {
  await dashboard("window.glanceai.saveSettings({autoSubmit:true,prompt:'Capture prompt'})");
  main.launchOverlay();
  const win = windows().overlayWindow;
  const rect = await win.webContents.executeJavaScript("(() => {const r=document.getElementById('undec-snap-btn').getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...rect });
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...rect });
  await until(async () => await win.webContents.executeJavaScript('window.__testEvents.sendClicked === 1'));
  shortcuts.get('CommandOrControl+S')();
  await until(async () => await win.webContents.executeJavaScript('window.__testEvents.sendClicked === 2'));
  assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll("[data-testid=attachment]").length'), 2);
});
suite.test('Repeated scroll shortcuts preserve their full distance without animation restart', async () => {
  const win = windows().overlayWindow;
  await win.webContents.executeJavaScript("(() => { const chat = document.querySelector('.conversation-container'); chat.innerHTML = '<div style=\"height:20000px\">Long conversation</div>'; chat.scrollTop = 0; })()");
  for (let i = 0; i < 5; i++) shortcuts.get('CommandOrControl+Shift+Down')();
  await until(async () => await win.webContents.executeJavaScript("document.querySelector('.conversation-container').scrollTop === 1600"));
});
app.whenReady().then(async () => {
  await session.defaultSession.protocol.handle('https', async request => {
    const url = new URL(request.url);
    const filename = url.pathname.endsWith('fixture-behavior.js') ? 'fixture-behavior.js' : 'gemini_mock.html';
    return new Response(await fs.readFile(path.resolve('tests/fixtures', filename)), { headers: { 'content-type': filename.endsWith('.js') ? 'text/javascript' : 'text/html' } });
  });
  const fakeImage = nativeImage.createFromBitmap(randomBytes(32 * 32 * 4), { width: 32, height: 32 });
  desktopCapturer.getSources = async () => [{ display_id: String(screen.getPrimaryDisplay().id), thumbnail: fakeImage }];
  main = await import(pathToFileURL(path.resolve(process.env.GLANCE_TEST_APP_ROOT || '.', 'src/main/main.js')).href);
  await until(() => !!windows().dashboardWindow && !windows().dashboardWindow.webContents.isLoading());
  await until(async () => await dashboard("document.getElementById('toggle-focusable').checked === true"));
  if (process.env.GLANCE_TEST_SCREENSHOTS) {
    await fs.mkdir(process.env.GLANCE_TEST_SCREENSHOTS, { recursive: true });
    await fs.writeFile(path.join(process.env.GLANCE_TEST_SCREENSHOTS, 'dashboard.png'), (await windows().dashboardWindow.webContents.capturePage()).toPNG());
  }
  const success = await suite.run();
  app.exit(success ? 0 : 1);
});
