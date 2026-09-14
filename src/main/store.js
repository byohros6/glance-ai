import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export const DEFAULT_SETTINGS = {
  windowWidth: 520,
  windowHeight: 650,
  x: null,
  y: 60,
  opacity: 0.95,
  undetectable: true,
  focusable: true,
  clickThrough: false,
  autoSubmit: false,
  prompt: 'Answer the question or coding task shown in the image clearly and step by step. Highlight the final solution or code.',
  shortcuts: {
    screenshot: 'CommandOrControl+S',
    send: 'CommandOrControl+Return',
    toggleVisibility: 'CommandOrControl+H',
    toggleFocus: 'CommandOrControl+F',
    toggleClickThrough: 'CommandOrControl+M',
    moveUp: 'CommandOrControl+Up',
    moveDown: 'CommandOrControl+Down',
    moveLeft: 'CommandOrControl+Left',
    moveRight: 'CommandOrControl+Right',
    scrollUp: 'CommandOrControl+Shift+Up',
    scrollDown: 'CommandOrControl+Shift+Down',
    opacityDown: 'CommandOrControl+[',
    opacityUp: 'CommandOrControl+]',
    emergencyExit: 'CommandOrControl+Shift+Q'
  }
};

export class SettingsStore {
  constructor(customPath = null) {
    this.filePath = customPath || (app ? path.join(app.getPath('userData'), 'undecgpt_settings.json') : null);
    this.settings = { ...DEFAULT_SETTINGS, shortcuts: { ...DEFAULT_SETTINGS.shortcuts } };
    this._saveTimer = null;
    if (typeof process !== 'undefined' && process && typeof process.on === 'function') {
      process.on('exit', () => {
        this.flush();
      });
    }
    this.load();
  }

  sanitize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ...DEFAULT_SETTINGS, shortcuts: { ...DEFAULT_SETTINGS.shortcuts } };
    }
    const clean = { ...DEFAULT_SETTINGS, shortcuts: { ...DEFAULT_SETTINGS.shortcuts } };

    if (Number.isFinite(raw.windowWidth) && raw.windowWidth >= 200) {
      clean.windowWidth = Math.round(raw.windowWidth);
    }
    if (Number.isFinite(raw.windowHeight) && raw.windowHeight >= 200) {
      clean.windowHeight = Math.round(raw.windowHeight);
    }
    clean.x = Number.isFinite(raw.x) ? Math.round(raw.x) : null;
    clean.y = Number.isFinite(raw.y) ? Math.round(raw.y) : 60;
    if (Number.isFinite(raw.opacity)) {
      clean.opacity = Math.max(0.15, Math.min(1.0, Math.round(raw.opacity * 100) / 100));
    }

    if (typeof raw.undetectable === 'boolean') clean.undetectable = raw.undetectable;
    if (typeof raw.focusable === 'boolean') clean.focusable = raw.focusable;
    if (typeof raw.clickThrough === 'boolean') clean.clickThrough = raw.clickThrough;
    if (typeof raw.autoSubmit === 'boolean') clean.autoSubmit = raw.autoSubmit;
    if (typeof raw.prompt === 'string') clean.prompt = raw.prompt;

    if (raw.shortcuts && typeof raw.shortcuts === 'object' && !Array.isArray(raw.shortcuts)) {
      clean.shortcuts = { ...DEFAULT_SETTINGS.shortcuts, ...raw.shortcuts };
    }
    return clean;
  }

  load() {
    if (!this.filePath) return;
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        if (!data.trim()) {
          this.settings = { ...DEFAULT_SETTINGS, shortcuts: { ...DEFAULT_SETTINGS.shortcuts } };
          return;
        }
        const parsed = JSON.parse(data);
        this.settings = this.sanitize(parsed);
      }
    } catch (err) {
      console.error('[Store] Failed to load settings (corrupted JSON). Resetting to defaults:', err.message);
      this.settings = { ...DEFAULT_SETTINGS, shortcuts: { ...DEFAULT_SETTINGS.shortcuts } };
    }
  }

  save() {
    if (!this.filePath) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tempPath = `${this.filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(this.settings, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error('[Store] Failed to save settings:', err);
    }
  }

  saveDebounced(delayMs = 250) {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
    }
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.save();
    }, delayMs);
  }

  flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      this.save();
    }
  }

  get(key) {
    return this.settings[key];
  }

  getAll() {
    return { ...this.settings, shortcuts: { ...this.settings.shortcuts } };
  }

  set(key, value) {
    this.settings[key] = value;
    this.saveDebounced(250);
  }

  setBounds(bounds) {
    if (!bounds || typeof bounds !== 'object') return;
    const { x, y, width, height, windowWidth, windowHeight } = bounds;
    if (Number.isFinite(x)) this.settings.x = Math.round(x);
    if (Number.isFinite(y)) this.settings.y = Math.round(y);
    const w = Number.isFinite(width) ? width : windowWidth;
    if (Number.isFinite(w) && w >= 200) this.settings.windowWidth = Math.round(w);
    const h = Number.isFinite(height) ? height : windowHeight;
    if (Number.isFinite(h) && h >= 200) this.settings.windowHeight = Math.round(h);
    this.saveDebounced(250);
  }

  update(newSettings) {
    this.settings = this.sanitize({
      ...this.settings,
      ...newSettings,
      shortcuts: {
        ...this.settings.shortcuts,
        ...(newSettings.shortcuts || {})
      }
    });
    this.save();
  }
}

export const store = new SettingsStore();
