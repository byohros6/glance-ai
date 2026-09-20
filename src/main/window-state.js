import { screen } from 'electron';
const appliedFlags = new WeakMap();

// Accept negative monitor coordinates and keep the whole window in a work area.
export function clampBounds(bounds, area) {
  const width = Math.min(Math.max(200, Math.round(bounds.width)), area.width);
  const height = Math.min(Math.max(200, Math.round(bounds.height)), area.height);
  return {
    width, height,
    x: Math.round(Math.max(area.x, Math.min(area.x + area.width - width, Number.isFinite(bounds.x) ? bounds.x : area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(area.y + area.height - height, Number.isFinite(bounds.y) ? bounds.y : area.y + 60)))
  };
}

export function visibleBounds(bounds) {
  const rect = { ...bounds, x: bounds.x ?? screen.getPrimaryDisplay().workArea.x, y: bounds.y ?? 60 };
  return clampBounds(bounds, screen.getDisplayMatching(rect).workArea);
}

export function hideWindow(win) {
  if (!win || win.isDestroyed()) return;
  win.hide();
  // Hidden windows don't need opacity/mouse mutations that must later be undone.
}

export function applyWindowState(win, settings, dashboard = false) {
  if (!win || win.isDestroyed()) return;
  // WS_EX_NOACTIVATE prevents future activation, but does not release an
  // already-active HWND. Hide first, then reveal without activation.
  const releaseFocus = !dashboard && !settings.focusable && win.isFocused() && win.isVisible();
  if (releaseFocus) win.hide();
  const previous = appliedFlags.get(win) || {};
  const opacity = dashboard ? 1 : settings.opacity;
  const focusable = dashboard || settings.focusable;
  const protectedContent = !dashboard && settings.undetectable;
  const level = dashboard ? 'normal' : 'screen-saver';
  if (Math.abs(win.getOpacity() - opacity) > .001) win.setOpacity(opacity);
  if (win.isFocusable() !== focusable) win.setFocusable(focusable);
  // Hover and capture temporarily change this flag outside this function.
  win.setIgnoreMouseEvents(dashboard ? false : settings.clickThrough, { forward: true });
  if (previous.skipTaskbar !== !dashboard) win.setSkipTaskbar(!dashboard);
  if (win.isContentProtected() !== protectedContent) win.setContentProtection(protectedContent);
  if (previous.level !== level || !win.isAlwaysOnTop()) win.setAlwaysOnTop(true, level);
  appliedFlags.set(win, { skipTaskbar: !dashboard, level });
  if (releaseFocus) win.showInactive();
}

export function restoreWindow(win, settings, dashboard = false, activate = false) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  applyWindowState(win, settings, dashboard);
  if (dashboard || (activate && settings.focusable)) { win.show(); win.focus(); }
  else win.showInactive();
}
