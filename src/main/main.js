import { app, BrowserWindow, session, ipcMain, shell, globalShortcut, screen, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { store, DEFAULT_SETTINGS } from './store.js';
import { registerGlobalShortcuts, validateShortcuts } from './shortcuts.js';
import { captureScreenWithHide } from './screenshot.js';
import { OperationCoordinator } from './operations.js';
import { createPermissionPolicy } from './permissions.js';
import { disableWindowTransitions } from './window-effects.js';
import { createUpdateChecker, RELEASES_URL } from './updates.js';
import { PROVIDER_URLS, isAllowedWebURL, isExternalURL, isTrustedSender, requireBoolean } from './security.js';
import { applyWindowState, restoreWindow, hideWindow, visibleBounds } from './window-state.js';
export { PROVIDER_URLS };

const directory = path.dirname(fileURLToPath(import.meta.url));
const dashboardPath = path.join(directory, '../renderer/dashboard.html');
const dashboardURL = pathToFileURL(dashboardPath).href;
const preload = path.join(directory, '../preload/preload.cjs');
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
export const GOOGLE_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15';
export const STANDARD_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
const userAgent = STANDARD_USER_AGENT;
app.userAgentFallback = STANDARD_USER_AGENT;

export function isGoogleDomain(url = '') {
  try {
    const hostname = new URL(url).hostname;
    return hostname.endsWith('google.com') || hostname.endsWith('youtube.com') || hostname.endsWith('gstatic.com') || hostname.endsWith('googleapis.com');
  } catch {
    return false;
  }
}

export function getUserAgentForURL(url = '') {
  return isGoogleDomain(url) ? GOOGLE_USER_AGENT : STANDARD_USER_AGENT;
}

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
let overlayWindow = null;
let dashboardWindow = null;
let currentMode = 'dashboard';
let loadedProvider = null;
let shortcutStatus = { registered: [], failed: [] };
let previewTimer = null;
let previewBounds = null;
let pauseTimer = null;
let quitting = false;
const updates = createUpdateChecker({ currentVersion: app.getVersion(), portable: Boolean(process.env.PORTABLE_EXECUTABLE_FILE) });
const promptedUpdates = new Set();
export async function checkUpdates(prompt = false) {
  const result = await updates.check();
  dashboardWindow?.webContents.send('action:update-status', result);
  if (prompt && result.status === 'available' && !promptedUpdates.has(result.version) && !quitting) {
    promptedUpdates.add(result.version);
    const choice = await dialog.showMessageBox({
      type: 'info', title: 'Glance AI update available',
      message: `Glance AI ${result.version} is available`,
      detail: result.portable ? 'Download the new portable app, quit Glance, and replace your old executable. Your settings are kept.' : 'Download the installer, quit Glance, and run it to update your existing installation. Your settings are kept.',
      buttons: [result.directDownload ? 'Download update' : 'Open release', 'Later'], defaultId: 1, cancelId: 1
    });
    if (choice.response === 0) await shell.openExternal(result.url);
  }
  return result;
}
const operations = new OperationCoordinator({
  capture: captureScreenWithHide, settings: () => store.getAll(),
  restore: win => applyWindowState(win, store.getAll())
});
export function getWindows() { return { overlayWindow, dashboardWindow }; }
function currentWindow() { return currentMode === 'dashboard' ? dashboardWindow : overlayWindow; }
function getOverlay() { return currentMode === 'gemini' ? overlayWindow : null; }
function notify(message) {
  const win = currentWindow();
  if (win && !win.isDestroyed()) win.webContents.send('action:show-toast', { message });
}
function settingsChanged() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) dashboardWindow.webContents.send('action:settings-changed', store.getAll());
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (!operations.active) applyWindowState(overlayWindow, store.getAll());
    overlayWindow.webContents.send('action:settings-changed', store.getAll());
  }
}
function exitApp() {
  quitting = true;
  operations.cancel();
  store.flush();
  globalShortcut.unregisterAll();
  app.exit(0);
}
async function runOperation(type) {
  const win = getOverlay();
  if (!win || !isAllowedWebURL(win.webContents.getURL())) {
    notify('Open your AI conversation before capturing or sending.');
    return { ok: false, error: 'No active AI conversation.' };
  }
  if (win.webContents.isLoadingMainFrame()) return { ok: false, error: 'The AI page is still loading. Please try again when it is ready.' };
  const result = await operations.run(win, type);
  if (!result.ok && !win.isDestroyed()) win.webContents.send('action:show-toast', { message: result.error });
  return result;
}
function register(shortcuts = store.get('shortcuts')) {
  clearTimeout(pauseTimer);
  pauseTimer = null;
  shortcutStatus = registerGlobalShortcuts(getOverlay, toggleDashboard, {
    screenshot: () => runOperation('capture'), send: () => runOperation('submit'),
    toggleVisibility: () => {
      const win = currentWindow();
      if (!win || win.isDestroyed()) return;
      if (win.isVisible()) hideWindow(win);
      else restoreWindow(win, store.getAll(), currentMode === 'dashboard');
    },
    toggleFocus: () => { store.set('focusable', !store.get('focusable')); settingsChanged(); },
    toggleClickThrough: () => { store.set('clickThrough', !store.get('clickThrough')); settingsChanged(); },
    opacityDown: () => { store.set('opacity', store.get('opacity') - .1); settingsChanged(); },
    opacityUp: () => { store.set('opacity', store.get('opacity') + .1); settingsChanged(); },
    emergencyExit: exitApp, onError: error => notify(error.message)
  }, shortcuts);
  dashboardWindow?.webContents.send('action:shortcut-status', shortcutStatus);
  return shortcutStatus;
}
function changeShortcuts(next) {
  validateShortcuts(next);
  const previous = store.get('shortcuts');
  const result = register(next);
  if (result.failed.length) {
    register(previous);
    throw new Error(`Shortcut unavailable: ${result.failed.map(item => item.accelerator).join(', ')}. Previous bindings restored.`);
  }
  try { store.update({ shortcuts: next }); }
  catch (error) { store.set('shortcuts', previous); register(previous); throw error; }
  settingsChanged();
  return store.get('shortcuts');
}
function openExternal(url) {
  if (isExternalURL(url)) shell.openExternal(url).catch(error => notify(`Could not open link: ${error.message}`));
}
function secureWebContents(contents, local = false) {
  const allowed = url => local ? url === dashboardURL : isAllowedWebURL(url, true);
  contents.on('will-navigate', (event, url) => {
    if (!allowed(url)) { event.preventDefault(); openExternal(url); }
  });
  contents.on('will-redirect', (event, url) => { if (!allowed(url)) event.preventDefault(); });
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (!local && isAllowedWebURL(url, true)) return { action: 'allow', overrideBrowserWindowOptions: {
      width: 520, height: 680, frame: true, alwaysOnTop: true, autoHideMenuBar: true,
      webPreferences: { preload: path.join(directory, '../preload/auth.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true }
    }};
    openExternal(url);
    return { action: 'deny' };
  });
  contents.on('did-create-window', child => {
    child.webContents.setUserAgent(GOOGLE_USER_AGENT);
    secureWebContents(child.webContents);
  });
}
function createDashboard() {
  const win = new BrowserWindow({ width: 840, height: 720, minWidth: 600, minHeight: 450, show: false, frame: false, backgroundColor: '#0d0f14', title: 'Glance AI', webPreferences: { preload, nodeIntegration: false, contextIsolation: true, sandbox: true } });
  dashboardWindow = win;
  void disableWindowTransitions(win);
  secureWebContents(win.webContents, true);
  win.on('close', event => { if (!quitting) { event.preventDefault(); exitApp(); } });
  win.on('closed', () => { dashboardWindow = null; });
  win.webContents.on('did-finish-load', () => win.webContents.send('action:shortcut-status', shortcutStatus));
  win.on('blur', () => { if (pauseTimer) register(); });
  win.loadFile(dashboardPath).catch(error => console.error('Dashboard failed to load:', error));
  return win;
}
function createOverlay() {
  const settings = store.getAll();
  const win = new BrowserWindow({ ...visibleBounds({ x: settings.x, y: settings.y, width: settings.windowWidth, height: settings.windowHeight }), show: false, frame: false, transparent: false, alwaysOnTop: true, skipTaskbar: true, focusable: settings.focusable, backgroundColor: '#0d0f14', title: 'Glance AI', webPreferences: { preload, nodeIntegration: false, contextIsolation: true, sandbox: true, spellcheck: true } });
  overlayWindow = win;
  void disableWindowTransitions(win);
  secureWebContents(win.webContents);
  const initialUA = getUserAgentForURL(PROVIDER_URLS[settings.provider] || '');
  win.webContents.setUserAgent(initialUA);
  for (const event of ['resize', 'move']) win.on(event, () => { if (!win.isDestroyed()) store.setBounds(win.getBounds()); });
  win.on('close', event => { if (!quitting) { event.preventDefault(); exitApp(); } });
  win.on('closed', () => { operations.cancel(win); overlayWindow = null; loadedProvider = null; });
  win.webContents.on('did-start-navigation', (_event, url, inPlace, mainFrame) => {
    if (mainFrame) {
      win.webContents.setUserAgent(getUserAgentForURL(url));
    }
    if (mainFrame && !inPlace) operations.cancel(win);
  });
  win.webContents.on('render-process-gone', () => {
    operations.cancel(win); loadedProvider = null; showDashboard();
    notify('The AI page stopped responding. Launch the overlay to reload it.');
  });
  win.webContents.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
    if (mainFrame && code !== -3) {
      loadedProvider = null; showDashboard();
      notify(`Could not load the AI page (${description}). Check your connection and launch again.`);
    }
  });
  return win;
}
export function showDashboard() {
  currentMode = 'dashboard';
  operations.cancel(overlayWindow);
  hideWindow(overlayWindow);
  const win = dashboardWindow && !dashboardWindow.isDestroyed() ? dashboardWindow : createDashboard();
  restoreWindow(win, store.getAll(), true, true);
  if (!win.webContents.isLoading()) win.webContents.send('action:settings-changed', store.getAll());
}
export function launchGeminiOverlay() {
  store.flush();
  register();
  const win = overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow : createOverlay();
  currentMode = 'gemini';
  hideWindow(dashboardWindow);
  const settings = store.getAll();
  win.setBounds(visibleBounds({ ...win.getBounds(), width: settings.windowWidth, height: settings.windowHeight }));
  restoreWindow(win, settings);
  if (loadedProvider !== settings.provider) {
    operations.cancel(win);
    loadedProvider = settings.provider;
    const targetUA = getUserAgentForURL(PROVIDER_URLS[settings.provider] || '');
    win.webContents.setUserAgent(targetUA);
    win.loadURL(PROVIDER_URLS[settings.provider], { userAgent: targetUA }).catch(error => {
      if (!win.isDestroyed() && error.code !== 'ERR_ABORTED') { loadedProvider = null; showDashboard(); notify('Unable to load the AI page. Check your connection and try again.'); }
    });
  } else win.webContents.send('action:settings-changed', settings);
}
export const launchOverlay = launchGeminiOverlay;
export function toggleDashboard() {
  if (currentMode === 'gemini') showDashboard();
  else if (dashboardWindow && !dashboardWindow.webContents.isLoading()) dashboardWindow.webContents.send('action:launch-request');
}

// Only the known main frame may use its role's channels. Provider pages receive no JS bridge.
function handle(channel, roles, callback) {
  ipcMain.handle(channel, (event, ...args) => {
    const dashboard = roles.includes('dashboard') && isTrustedSender(event, dashboardWindow, url => url === dashboardURL);
    const overlay = roles.includes('overlay') && isTrustedSender(event, overlayWindow, url => isAllowedWebURL(url));
    if (!dashboard && !overlay) throw new Error('This page is not allowed to use this control.');
    return callback(...args);
  });
}
const both = ['dashboard', 'overlay'];
handle('get-settings', both, () => store.getAll());
handle('save-settings', ['dashboard'], value => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(DEFAULT_SETTINGS, key) || key === 'shortcuts')) throw new Error('Invalid settings');
  const result = store.update(value); settingsChanged(); return result;
});
handle('get-app-version', ['dashboard'], () => app.getVersion());
handle('get-update-status', ['dashboard'], () => updates.getState());
handle('check-for-updates', ['dashboard'], () => checkUpdates());
handle('open-update', ['dashboard'], () => shell.openExternal(updates.getState().url || RELEASES_URL));
handle('get-app-mode', both, () => currentMode);
handle('get-shortcut-status', ['dashboard'], () => shortcutStatus);
handle('get-focusable', both, () => store.get('focusable'));
handle('get-click-through', both, () => store.get('clickThrough'));
handle('set-focusable', both, value => { store.set('focusable', requireBoolean(value)); settingsChanged(); return value; });
handle('set-click-through', both, value => { store.set('clickThrough', requireBoolean(value)); settingsChanged(); return value; });
handle('set-opacity', ['overlay'], value => {
  if (!Number.isFinite(value)) throw new Error('Invalid opacity');
  store.set('opacity', value); settingsChanged(); return true;
});
handle('set-ignore-mouse-events', ['overlay'], (ignore) => {
  requireBoolean(ignore);
  if (!operations.active) overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
  return true;
});
handle('hide-window', both, () => { hideWindow(currentWindow()); return true; });
handle('close-app', both, exitApp);
handle('launch-overlay', ['dashboard'], () => { launchOverlay(); return true; });
handle('launch-gemini', ['dashboard'], () => { launchOverlay(); return true; });
handle('open-dashboard', ['overlay'], () => { showDashboard(); return true; });
handle('capture-and-attach', ['overlay'], () => runOperation('capture'));
handle('submit-message', ['overlay'], () => runOperation('submit'));
handle('operation-complete', ['overlay'], result => operations.complete(overlayWindow, result));
handle('update-shortcut', ['dashboard'], ({ action, accelerator } = {}) => {
  if (!Object.hasOwn(DEFAULT_SETTINGS.shortcuts, action)) throw new Error('Unknown shortcut action');
  return changeShortcuts({ ...store.get('shortcuts'), [action]: accelerator });
});
handle('reset-shortcuts', ['dashboard'], () => changeShortcuts({ ...DEFAULT_SETTINGS.shortcuts }));
handle('pause-shortcuts', ['dashboard'], () => {
  globalShortcut.unregisterAll(); clearTimeout(pauseTimer);
  // Recording cannot permanently disable recovery controls if its renderer goes away.
  pauseTimer = setTimeout(register, 30000); return true;
});
handle('resume-shortcuts', ['dashboard'], () => register());
handle('preview-overlay-size', ['dashboard'], ({ width, height } = {}) => {
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error('Invalid size');
  const win = dashboardWindow;
  previewBounds ??= win.getBounds(); clearTimeout(previewTimer);
  win.setBounds(visibleBounds({ ...previewBounds, width, height }));
  previewTimer = setTimeout(() => {
    if (!win.isDestroyed()) win.setBounds(previewBounds);
    previewBounds = null;
  }, 2000); return true;
});

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (isGoogleDomain(details.url)) {
      details.requestHeaders['User-Agent'] = GOOGLE_USER_AGENT;
      delete details.requestHeaders['sec-ch-ua'];
      delete details.requestHeaders['sec-ch-ua-mobile'];
      delete details.requestHeaders['sec-ch-ua-platform'];
    } else {
      details.requestHeaders['User-Agent'] = STANDARD_USER_AGENT;
      if (details.requestHeaders['sec-ch-ua']) {
        details.requestHeaders['sec-ch-ua'] = '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"';
      }
    }
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });
  const permissions = createPermissionPolicy();
  session.defaultSession.setPermissionRequestHandler(async (contents, permission, callback, details) => {
    const origin = details.requestingUrl || contents.getURL();
    if (permissions.check(origin, permission, details)) { callback(true); return; }
    if (!permissions.canRequest(origin, permission)) { callback(false); return; }
    try {
      const response = await dialog.showMessageBox({ type: 'question', buttons: ['Deny', 'Allow'], defaultId: 0, cancelId: 0, message: `Allow ${new URL(origin).hostname} to use ${permission}?` });
      if (response.response === 1) permissions.grant(origin, permission, details);
      callback(response.response === 1);
    } catch { callback(false); }
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission, origin, details) => permissions.check(origin, permission, details));
  showDashboard();
  // Network checks run in the background, outside startup and shortcut handling.
  if (app.isPackaged) {
    setTimeout(() => checkUpdates(true).catch(() => {}), 12000).unref();
    setInterval(() => checkUpdates(true).catch(() => {}), 12 * 60 * 60 * 1000).unref();
  }
  try { register(); } catch (error) { shortcutStatus = { registered: [], failed: [{ error: error.message }] }; notify('Saved shortcuts are invalid. Reset shortcuts in the dashboard.'); }
  const recover = () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.setBounds(visibleBounds(overlayWindow.getBounds()));
  };
  screen.on('display-removed', recover); screen.on('display-metrics-changed', recover);
});
app.on('second-instance', () => restoreWindow(currentWindow(), store.getAll(), currentMode === 'dashboard', true));
app.on('activate', () => { if (!currentWindow()) showDashboard(); else restoreWindow(currentWindow(), store.getAll(), currentMode === 'dashboard', true); });
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { store.flush(); globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
