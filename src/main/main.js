import { app, BrowserWindow, session, ipcMain, shell, globalShortcut } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from './store.js';
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

let mainWindow = null;

function getMainWindow() {
  return mainWindow;
}

function createWindow() {
  const width = store.get('windowWidth') || 520;
  const height = store.get('windowHeight') || 650;
  const savedX = store.get('x');
  const savedY = store.get('y') ?? 50;

  const isFocusable = store.get('focusable') ?? true;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: savedX !== null ? savedX : undefined,
    y: savedY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    type: 'toolbar', // Windows WS_EX_TOOLWINDOW: completely hides from taskbar and Alt+Tab
    focusable: isFocusable,
    hasShadow: false,
    resizable: true,
    movable: true,
    title: 'UndecGPT',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
      spellcheck: true
    }
  });

  // Explicitly ensure it never shows up in Windows Taskbar
  mainWindow.setSkipTaskbar(true);

  // Windows Screen-Share Invisibility (SetWindowDisplayAffinity)
  const isUndetectable = store.get('undetectable') !== false;
  mainWindow.setContentProtection(isUndetectable);
  console.log(`[UndecGPT] Content protection (screen-share undetectable): ${isUndetectable}`);

  // Float above other windows
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // Set initial opacity
  const initialOpacity = store.get('opacity') || 0.95;
  mainWindow.setOpacity(initialOpacity);

  // Set initial click-through if enabled
  if (store.get('clickThrough')) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    console.log('[UndecGPT] Click-through mode initialized: ON');
  }

  // Set Chrome User-Agent for Google Gemini authentication
  mainWindow.webContents.setUserAgent(CHROME_USER_AGENT);

  // Handle child windows / OAuth popups
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('accounts.google.com') || url.includes('google.com')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          alwaysOnTop: true,
          frame: true,
          autoHideMenuBar: true
        }
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load Gemini
  mainWindow.loadURL('https://gemini.google.com/app', {
    userAgent: CHROME_USER_AGENT
  });

  // Save window bounds on resize/move (debounced in store)
  mainWindow.on('resize', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [w, h] = mainWindow.getSize();
    store.setBounds({ width: w, height: h });
  });

  mainWindow.on('move', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [x, y] = mainWindow.getPosition();
    store.setBounds({ x, y });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  // Override User-Agent headers on all outgoing web requests
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = CHROME_USER_AGENT;
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  createWindow();
  registerGlobalShortcuts(getMainWindow);

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
  app.quit();
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


