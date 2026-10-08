import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export const SUPPORTED_PROVIDERS = ['gemini', 'chatgpt', 'claude', 'perplexity'];

export const DEFAULT_SETTINGS = {
  provider: 'gemini',
  windowWidth: 520,
  windowHeight: 650,
  x: null,
  y: 60,
  opacity: 1,
  undetectable: true,
  focusable: true,
  clickThrough: false,
  autoSubmit: false,
  prompt: 'Answer the question or coding task shown in the image clearly and step by step. Highlight the final solution or code.',
  shortcuts: {
    screenshot: 'CommandOrControl+S',
    send: 'CommandOrControl+Return',
    returnHome: 'CommandOrControl+B',
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
    if (customPath) {
      this.filePath = customPath;
    } else if (app) {
      const primaryPath = path.join(app.getPath('userData'), 'glance_settings.json');
      const legacyPath = path.join(app.getPath('userData'), 'glance_legacy_settings.json');
      this.filePath = !fs.existsSync(primaryPath) && fs.existsSync(legacyPath) ? legacyPath : primaryPath;
    } else {
      this.filePath = null;
    }
    this.settings = { ...DEFAULT_SETTINGS, shortcuts: { ...DEFAULT_SETTINGS.shortcuts } };
    this._saveTimer = null;
    this.lastError = null;
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
      clean.windowWidth = Math.min(4096, Math.round(raw.windowWidth));
    }
    if (Number.isFinite(raw.windowHeight) && raw.windowHeight >= 200) {
      clean.windowHeight = Math.min(4096, Math.round(raw.windowHeight));
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
    if (typeof raw.prompt === 'string') clean.prompt = raw.prompt.slice(0, 50000);
    if (typeof raw.provider === 'string' && SUPPORTED_PROVIDERS.includes(raw.provider.toLowerCase())) {
      clean.provider = raw.provider.toLowerCase();
    }

    if (raw.shortcuts && typeof raw.shortcuts === 'object' && !Array.isArray(raw.shortcuts)) {
      for (const key of Object.keys(DEFAULT_SETTINGS.shortcuts)) {
        if (typeof raw.shortcuts[key] === 'string' && raw.shortcuts[key].trim() && raw.shortcuts[key].length <= 100) clean.shortcuts[key] = raw.shortcuts[key];
      }
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
    if (!this.filePath) return true;
    let tempPath;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      tempPath = `${this.filePath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(this.settings, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.filePath);
      this.lastError = null;
      return true;
    } catch (err) {
      if (tempPath) { try { fs.unlinkSync(tempPath); } catch {} }
      this.lastError = err;
      console.error('[Store] Failed to save settings:', err);
      return false;
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
    return key === 'shortcuts' ? { ...this.settings.shortcuts } : this.settings[key];
  }

  getAll() {
    return { ...this.settings, shortcuts: { ...this.settings.shortcuts } };
  }

  set(key, value) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, key)) throw new Error('Unknown setting');
    this.settings = this.sanitize({ ...this.settings, [key]: value });
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

  update(newSettings, { debounce = false } = {}) {
    if (!newSettings || typeof newSettings !== 'object' || Array.isArray(newSettings)) throw new TypeError('Settings must be an object');
    this.settings = this.sanitize({
      ...this.settings,
      ...newSettings,
      shortcuts: {
        ...this.settings.shortcuts,
        ...(newSettings.shortcuts || {})
      }
    });
    if (debounce) this.saveDebounced();
    else {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      if (!this.save()) throw new Error('Settings could not be saved to disk.');
    }
    return this.getAll();
  }
}

export const store = new SettingsStore();
