import { app, BrowserWindow, session, ipcMain, shell, globalShortcut } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store, DEFAULT_SETTINGS } from './store.js';
import { registerGlobalShortcuts } from './shortcuts.js';
import { captureScreen, captureScreenWithHide } from './screenshot.js';

app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

app.userAgentFallback = CHROME_USER_AGENT;

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

export const PROVIDER_URLS = {
  gemini: 'https://gemini.google.com/app',
  chatgpt: 'https://chatgpt.com/',
  claude: 'https://claude.ai/',
  perplexity: 'https://www.perplexity.ai/'
};

let mainWindow = null;
let currentMode = 'dashboard'; // 'dashboard' or 'gemini'

function getMainWindow() {
  return mainWindow;
}

export function showDashboard() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  currentMode = 'dashboard';

  mainWindow.setSize(840, 720);
  mainWindow.center();
  mainWindow.setSkipTaskbar(false);
  mainWindow.setOpacity(1.0);
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.setFocusable(true);
  mainWindow.setAlwaysOnTop(true);
  mainWindow.setContentProtection(false);
  mainWindow.loadFile(path.join(__dirname, '../renderer/dashboard.html'));
  mainWindow.show();
  mainWindow.focus();
}

export function launchGeminiOverlay() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  currentMode = 'gemini';

  const width = store.get('windowWidth') || 520;
  const height = store.get('windowHeight') || 650;
  const savedX = store.get('x');
  const savedY = store.get('y') ?? 50;
  const isFocusable = store.get('focusable') ?? true;

  mainWindow.setSize(width, height);
  if (savedX !== null && Number.isFinite(savedX) && Number.isFinite(savedY)) {
    mainWindow.setPosition(savedX, savedY);
  }

  const isUndetectable = store.get('undetectable') !== false;
  mainWindow.setContentProtection(isUndetectable);
  mainWindow.setSkipTaskbar(true);
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  const initialOpacity = store.get('opacity') || 0.95;
  mainWindow.setOpacity(initialOpacity);
  mainWindow.setFocusable(isFocusable);

  if (store.get('clickThrough')) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    mainWindow.setIgnoreMouseEvents(false);
  }

  const provider = store.get('provider') || 'gemini';
  const targetUrl = PROVIDER_URLS[provider] || PROVIDER_URLS.gemini;

  mainWindow.webContents.setUserAgent(CHROME_USER_AGENT);
  mainWindow.loadURL(targetUrl, {
    userAgent: CHROME_USER_AGENT
  });
}

export const launchOverlay = launchGeminiOverlay;

function toggleDashboard() {
  if (currentMode === 'gemini') {
    showDashboard();
  } else {
    launchGeminiOverlay();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 840,
    height: 720,
    center: true,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false, // Dashboard appears in taskbar like a normal app
    focusable: true,
    hasShadow: true,
    resizable: true,
    movable: true,
    title: 'Glance AI',
    backgroundColor: '#0d0f14',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
      spellcheck: true
    }
  });

  // Handle child windows / OAuth popups
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('accounts.google.com') || url.includes('google.com')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 680,
          center: true,
          alwaysOnTop: true,
          frame: true,
          autoHideMenuBar: true,
          backgroundColor: '#ffffff',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
          }
        }
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Save window bounds on resize/move only when in Gemini overlay mode
  mainWindow.on('resize', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (currentMode === 'gemini') {
      const [w, h] = mainWindow.getSize();
      store.setBounds({ width: w, height: h });
    }
  });

  mainWindow.on('move', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (currentMode === 'gemini') {
      const [x, y] = mainWindow.getPosition();
      store.setBounds({ x, y });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Start with Dashboard
  showDashboard();
}

// App lifecycle
app.whenReady().then(() => {
  // Uniform Chrome 132 User-Agent across all web requests ensuring full session cookie synchronization
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = CHROME_USER_AGENT;
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  createWindow();
  registerGlobalShortcuts(getMainWindow, toggleDashboard);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (mainWindow.isFocusable()) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      mainWindow.showInactive();
    }
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setSkipTaskbar(true);
    const isUndetectable = store.get('undetectable') !== false;
    mainWindow.setContentProtection(isUndetectable);
  }
});

app.on('will-quit', () => {
  store.flush();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Register IPC handlers for renderer controls
ipcMain.handle('get-settings', () => {
  return store.getAll();
});

ipcMain.handle('save-settings', (_event, newSettings) => {
  store.update(newSettings);
  return store.getAll();
});

ipcMain.handle('set-opacity', (_event, opacityVal) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const num = Number.isFinite(opacityVal) ? opacityVal : 0.95;
    const clamped = Math.max(0.15, Math.min(1.0, num));
    mainWindow.setOpacity(clamped);
    store.set('opacity', clamped);
    mainWindow.webContents.send('action:opacity-changed', clamped);
  }
  return true;
});

ipcMain.handle('hide-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setOpacity(0);
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    mainWindow.hide();
  }
  return true;
});

ipcMain.handle('close-app', () => {
  console.log('[Undec] close-app invoked, terminating process');
  try {
    globalShortcut.unregisterAll();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy();
    }
  } catch (err) {
    console.error('[Undec] Error closing window:', err);
  }
  app.exit(0);
});

ipcMain.handle('take-screenshot', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return await captureScreen();
  }
  const isClickThrough = store.get('clickThrough') ?? false;
  const storedOpacity = store.get('opacity') || 0.95;
  return await captureScreenWithHide(mainWindow, {
    savedOpacity: mainWindow.getOpacity() > 0 ? mainWindow.getOpacity() : storedOpacity,
    clickThrough: isClickThrough,
    defaultOpacity: storedOpacity
  });
});

ipcMain.handle('get-focusable', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow.isFocusable();
  }
  return store.get('focusable') ?? true;
});

ipcMain.handle('set-focusable', (_event, focusableVal) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setFocusable(focusableVal);
    if (!focusableVal && mainWindow.isFocused()) {
      mainWindow.blur();
    }
    store.set('focusable', focusableVal);
    mainWindow.webContents.send('action:focus-changed', focusableVal);
    console.log(`[UndecGPT] Window focusable set to: ${focusableVal}`);
  }
  return store.get('focusable');
});

ipcMain.handle('set-ignore-mouse-events', (_event, ignore, options) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(ignore, options);
  }
  return true;
});

ipcMain.handle('get-click-through', () => {
  return store.get('clickThrough') ?? false;
});

ipcMain.handle('set-click-through', (_event, enabled) => {
  store.set('clickThrough', enabled);
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (enabled) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      mainWindow.setIgnoreMouseEvents(false);
    }
    console.log(`[UndecGPT] Click-through set to: ${enabled}`);
  }
  return enabled;
});

ipcMain.handle('launch-gemini', () => {
  launchGeminiOverlay();
  return true;
});

ipcMain.handle('launch-overlay', () => {
  launchGeminiOverlay();
  return true;
});

ipcMain.handle('open-dashboard', () => {
  showDashboard();
  return true;
});

ipcMain.handle('get-app-mode', () => currentMode);

ipcMain.handle('update-shortcut', (_event, { action, accelerator }) => {
  const shortcuts = store.get('shortcuts') || {};
  shortcuts[action] = accelerator;
  store.set('shortcuts', shortcuts);
  registerGlobalShortcuts(getMainWindow, toggleDashboard);
  return store.get('shortcuts');
});

ipcMain.handle('reset-shortcuts', () => {
  store.set('shortcuts', { ...DEFAULT_SETTINGS.shortcuts });
  registerGlobalShortcuts(getMainWindow, toggleDashboard);
  return store.get('shortcuts');
});

ipcMain.handle('pause-shortcuts', () => {
  globalShortcut.unregisterAll();
  return true;
});

ipcMain.handle('resume-shortcuts', () => {
  registerGlobalShortcuts(getMainWindow, toggleDashboard);
  return true;
});

ipcMain.handle('preview-overlay-size', async (_event, { width, height }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const originalBounds = mainWindow.getBounds();
  const w = Math.max(300, Math.min(1600, parseInt(width, 10) || 520));
  const h = Math.max(300, Math.min(1400, parseInt(height, 10) || 650));
  mainWindow.setSize(w, h);
  mainWindow.center();
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && currentMode === 'dashboard') {
      mainWindow.setBounds(originalBounds);
    }
  }, 2000);
  return true;
});



