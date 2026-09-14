import { globalShortcut, app } from 'electron';
import { captureScreen, captureScreenWithHide } from './screenshot.js';
import { store } from './store.js';

const MOVE_OFFSET = 40;
const SCROLL_OFFSET = 320;

export function registerGlobalShortcuts(getMainWindow) {
  // Clear any existing shortcuts
  globalShortcut.unregisterAll();

  const shortcuts = store.get('shortcuts') || {};

  // 1. Screenshot & Attach (Ctrl + S)
  const snapKey = shortcuts.screenshot || 'CommandOrControl+S';
  tryRegister(snapKey, async () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;

    console.log('[Shortcuts] Screenshot triggered (WhisprGPT stealth workflow)');

    const isClickThrough = store.get('clickThrough') ?? false;
    const storedOpacity = store.get('opacity') || 0.95;

    // Use unified pre-roll capture helper with 100ms compositor wait & capture mutex
    const dataUrl = await captureScreenWithHide(win, {
      savedOpacity: win.getOpacity() > 0 ? win.getOpacity() : storedOpacity,
      clickThrough: isClickThrough,
      defaultOpacity: storedOpacity
    });

    if (!dataUrl) {
      console.warn('[Shortcuts] Capture skipped or returned empty dataUrl');
      return;
    }

    console.log('[Shortcuts] Screenshot captured successfully. Attaching to Gemini...');
    const prompt = store.get('prompt') || '';

    // Unified single execution path: dispatch IPC action to renderer (prevents double-upload race)
    win.webContents.send('action:attach-screenshot', {
      dataUrl,
      prompt
    });
  });

  // 2. Send Message to Gemini (Ctrl + Enter / Ctrl + Return)
  const sendKey = shortcuts.send || 'CommandOrControl+Return';
  const handleSend = async () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    console.log('[Shortcuts] Send triggered (Ctrl+Enter / Return)');

    // Unified single execution path: dispatch submit action to renderer
    win.webContents.send('action:submit');
  };
  tryRegister(sendKey, handleSend);
  if (sendKey !== 'CommandOrControl+Return' && !globalShortcut.isRegistered('CommandOrControl+Return')) {
    tryRegister('CommandOrControl+Return', handleSend);
  }
  if (sendKey !== 'CommandOrControl+Enter' && !globalShortcut.isRegistered('CommandOrControl+Enter')) {
    tryRegister('CommandOrControl+Enter', handleSend);
  }

  // 3. Toggle Focusable Mode (Ctrl + F)
  const focusKey = shortcuts.toggleFocus || 'CommandOrControl+F';
  tryRegister(focusKey, () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    const current = win.isFocusable();
    const next = !current;
    win.setFocusable(next);
    if (!next && win.isFocused()) {
      win.blur();
    }
    store.set('focusable', next);
    console.log('[Shortcuts] Toggled focusable mode to:', next);
    win.webContents.send('action:focus-changed', next);
  });

  // 4. Toggle Click-Through Mode (Ctrl + M)
  const clickThroughKey = shortcuts.toggleClickThrough || 'CommandOrControl+M';
  tryRegister(clickThroughKey, () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    const current = store.get('clickThrough') ?? false;
    const next = !current;
    store.set('clickThrough', next);
    if (next) {
      win.setIgnoreMouseEvents(true, { forward: true });
    } else {
      win.setIgnoreMouseEvents(false);
    }
    console.log('[Shortcuts] Toggled click-through mode to:', next);
    win.webContents.send('action:click-through-changed', next);
  });

  // 5. Hide / Show Toggle (Boss key)
  const hideKey = shortcuts.toggleVisibility || 'CommandOrControl+H';
  tryRegister(hideKey, () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;

    if (win.isVisible()) {
      win.setOpacity(0);
      win.setIgnoreMouseEvents(true, { forward: true });
      win.hide();
      console.log('[Shortcuts] Overlay hidden');
    } else {
      win.showInactive();
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setSkipTaskbar(true);
      const isUndetectable = store.get('undetectable') !== false;
      win.setContentProtection(isUndetectable);
      win.setOpacity(store.get('opacity') || 0.95);
      if (store.get('clickThrough')) {
        win.setIgnoreMouseEvents(true, { forward: true });
      } else {
        win.setIgnoreMouseEvents(false);
      }
      console.log('[Shortcuts] Overlay shown (inactive)');
    }
  });

  // 6. Move Up
  const moveUpKey = shortcuts.moveUp || 'CommandOrControl+Up';
  tryRegister(moveUpKey, () => {
    moveWindow(getMainWindow, 0, -MOVE_OFFSET);
  });

  // 7. Move Down
  const moveDownKey = shortcuts.moveDown || 'CommandOrControl+Down';
  tryRegister(moveDownKey, () => {
    moveWindow(getMainWindow, 0, MOVE_OFFSET);
  });

  // 8. Move Left
  const moveLeftKey = shortcuts.moveLeft || 'CommandOrControl+Left';
  tryRegister(moveLeftKey, () => {
    moveWindow(getMainWindow, -MOVE_OFFSET, 0);
  });

  // 9. Move Right
  const moveRightKey = shortcuts.moveRight || 'CommandOrControl+Right';
  tryRegister(moveRightKey, () => {
    moveWindow(getMainWindow, MOVE_OFFSET, 0);
  });

  // 10. Scroll Chat Up
  const scrollUpKey = shortcuts.scrollUp || 'CommandOrControl+Shift+Up';
  tryRegister(scrollUpKey, () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('action:scroll', -SCROLL_OFFSET);
    }
  });

  // 11. Scroll Chat Down
  const scrollDownKey = shortcuts.scrollDown || 'CommandOrControl+Shift+Down';
  tryRegister(scrollDownKey, () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('action:scroll', SCROLL_OFFSET);
    }
  });

  // 12. Opacity Down
  const opDownKey = shortcuts.opacityDown || 'CommandOrControl+[';
  tryRegister(opDownKey, () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    const current = win.getOpacity();
    const next = Math.max(0.15, Math.round((current - 0.1) * 100) / 100);
    win.setOpacity(next);
    store.set('opacity', next);
    win.webContents.send('action:opacity-changed', next);
    win.webContents.send('action:show-toast', {
      message: `🔍 Opacity: ${Math.round(next * 100)}%`,
      type: 'info'
    });
  });

  // 13. Opacity Up
  const opUpKey = shortcuts.opacityUp || 'CommandOrControl+]';
  tryRegister(opUpKey, () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    const current = win.getOpacity();
    const next = Math.min(1.0, Math.round((current + 0.1) * 100) / 100);
    win.setOpacity(next);
    store.set('opacity', next);
    win.webContents.send('action:opacity-changed', next);
    win.webContents.send('action:show-toast', {
      message: `🔍 Opacity: ${Math.round(next * 100)}%`,
      type: 'info'
    });
  });

  // 14. Emergency Exit
  const exitKey = shortcuts.emergencyExit || 'CommandOrControl+Shift+Q';
  tryRegister(exitKey, () => {
    console.log('[Shortcuts] Emergency Exit triggered');
    try {
      globalShortcut.unregisterAll();
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.destroy();
      }
    } catch (e) {
      console.error('[Shortcuts] Error destroying window during emergency exit:', e);
    }
    app.exit(0);
  });
}

function moveWindow(getMainWindow, deltaX, deltaY) {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  const newX = x + deltaX;
  const newY = Math.max(0, y + deltaY);
  win.setPosition(newX, newY);
  store.setBounds({ x: newX, y: newY });
}

function tryRegister(accelerator, handler) {
  try {
    const success = globalShortcut.register(accelerator, handler);
    if (!success) {
      console.warn(`[Shortcuts] Failed to register accelerator: ${accelerator}`);
    } else {
      console.log(`[Shortcuts] Registered: ${accelerator}`);
    }
  } catch (err) {
    console.error(`[Shortcuts] Error registering ${accelerator}:`, err);
  }
}
