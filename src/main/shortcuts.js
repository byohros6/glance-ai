import { globalShortcut, app } from 'electron';
import { store, DEFAULT_SETTINGS } from './store.js';
import { captureScreenWithHide } from './screenshot.js';
import { OperationCoordinator } from './operations.js';
import { hideWindow, restoreWindow, applyWindowState, visibleBounds } from './window-state.js';

const operations = new OperationCoordinator({ capture: captureScreenWithHide, settings: () => store.getAll(), restore: win => applyWindowState(win, store.getAll()) });

export function normalizeAccelerator(value) {
  if (typeof value !== 'string' || value.length > 100) throw new Error('Invalid shortcut');
  const parts = value.toLowerCase().split('+').map(p => p.trim());
  const key = parts.pop()?.replace(/^enter$/, 'return');
  const modifiers = parts.map(p => ({ control: 'ctrl', commandorcontrol: process.platform === 'darwin' ? 'cmd' : 'ctrl', cmdorctrl: process.platform === 'darwin' ? 'cmd' : 'ctrl', command: 'cmd', option: 'alt', meta: 'super' }[p] || p));
  if (!key || !/^([a-z0-9\[\],.;'\/\\`=\-]|f([1-9]|1[0-9]|2[0-4])|return|space|tab|escape|backspace|delete|insert|home|end|pageup|pagedown|up|down|left|right|plus|minus)$/.test(key) || modifiers.some(p => !['ctrl', 'alt', 'shift', 'cmd', 'super'].includes(p)) || new Set(modifiers).size !== modifiers.length || (!modifiers.some(p => p !== 'shift') && !/^f\d+$/.test(key))) throw new Error('Use Ctrl, Alt, Command, or a function key in the shortcut.');
  return [...modifiers.sort(), key].join('+');
}

export function validateShortcuts(shortcuts) {
  const used = new Map();
  for (const action of Object.keys(DEFAULT_SETTINGS.shortcuts)) {
    const key = normalizeAccelerator(shortcuts[action]);
    if (used.has(key)) throw new Error(`Shortcut conflicts with ${used.get(key)}. Choose a different key combination.`);
    used.set(key, action);
  }
  return shortcuts;
}

export function createShortcutHandlers(getMainWindow, onToggleDashboard, actions = {}) {
  const change = patch => {
    store.update(patch, { debounce: true });
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      applyWindowState(win, store.getAll());
      win.webContents.send('action:settings-changed', store.getAll());
    }
  };
  const move = (dx, dy) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    const bounds = win.getBounds();
    const next = visibleBounds({ ...bounds, x: bounds.x + dx, y: bounds.y + dy });
    win.setBounds(next);
    store.setBounds(next);
  };
  const scroll = amount => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('action:scroll', amount);
  };
  const opacity = delta => change({ opacity: Math.max(.15, Math.min(1, Math.round((store.get('opacity') + delta) * 100) / 100)) });
  return {
    screenshot: () => operations.run(getMainWindow(), 'capture'),
    send: () => operations.run(getMainWindow(), 'submit'),
    returnHome: () => onToggleDashboard?.(),
    toggleFocus: () => change({ focusable: !store.get('focusable') }),
    toggleClickThrough: () => change({ clickThrough: !store.get('clickThrough') }),
    toggleVisibility: () => {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;
      if (win.isVisible()) hideWindow(win);
      else restoreWindow(win, store.getAll());
    },
    moveUp: () => move(0, -40), moveDown: () => move(0, 40),
    moveLeft: () => move(-40, 0), moveRight: () => move(40, 0),
    scrollUp: () => scroll(-320), scrollDown: () => scroll(320),
    opacityDown: () => opacity(-.1), opacityUp: () => opacity(.1),
    emergencyExit: () => { store.flush(); globalShortcut.unregisterAll(); app.exit(0); },
    ...actions
  };
}

export function registerGlobalShortcuts(getMainWindow, onToggleDashboard = null, actions = {}, shortcuts = store.get('shortcuts')) {
  validateShortcuts(shortcuts);
  const handlers = createShortcutHandlers(getMainWindow, onToggleDashboard, actions);
  globalShortcut.unregisterAll();
  const result = { registered: [], failed: [] };
  for (const [action, accelerator] of Object.entries(shortcuts)) {
    if (!handlers[action]) continue;
    try {
      const registered = globalShortcut.register(accelerator, () => {
        const reportError = error => {
          console.error(`[Shortcuts] ${action}:`, error);
          actions.onError?.(error);
        };
        // Native hotkey callbacks do not reliably flush queued microtasks until
        // another event-loop wakeup. Perform synchronous controls immediately;
        // observe promise rejection only after starting async capture/send work.
        try { Promise.resolve(handlers[action]()).catch(reportError); }
        catch (error) { reportError(error); }
      });
      (registered ? result.registered : result.failed).push({ action, accelerator });
    } catch (error) { result.failed.push({ action, accelerator, error: error.message }); }
  }
  return result;
}
