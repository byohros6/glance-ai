import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { store, SettingsStore, DEFAULT_SETTINGS } from '../../src/main/store.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const suite = createTestSuite('Tier 1: Store & Settings Defaults');

const tempSettingsFile = path.join(os.tmpdir(), `undecgpt_store_defaults_test_${Date.now()}.json`);

suite.test('DEFAULT_SETTINGS defines correct default geometry and stealth settings', () => {
  assert.strictEqual(DEFAULT_SETTINGS.windowWidth, 520, 'windowWidth default should be 520');
  assert.strictEqual(DEFAULT_SETTINGS.windowHeight, 650, 'windowHeight default should be 650');
  assert.strictEqual(DEFAULT_SETTINGS.x, null, 'x default should be null');
  assert.strictEqual(DEFAULT_SETTINGS.y, 60, 'y default should be 60');
  assert.strictEqual(DEFAULT_SETTINGS.undetectable, true, 'undetectable should default to true');
  assert.strictEqual(DEFAULT_SETTINGS.focusable, true, 'focusable should default to true');
  assert.strictEqual(DEFAULT_SETTINGS.clickThrough, false, 'clickThrough should default to false');
  assert.strictEqual(DEFAULT_SETTINGS.autoSubmit, false, 'autoSubmit should default to false');
  assert.strictEqual(DEFAULT_SETTINGS.opacity, 0.95, 'opacity should default to 0.95');
});

suite.test('Fresh SettingsStore instance loads all default window geometry and stealth settings', () => {
  if (fs.existsSync(tempSettingsFile)) fs.unlinkSync(tempSettingsFile);
  const testStore = new SettingsStore(tempSettingsFile);

  const all = testStore.getAll();
  assert.ok(all, 'Store should return settings object');
  assert.strictEqual(typeof all.windowWidth, 'number', 'windowWidth must be a number');
  assert.strictEqual(typeof all.windowHeight, 'number', 'windowHeight must be a number');
  assert.strictEqual(all.windowWidth, 520, 'windowWidth default should be 520');
  assert.strictEqual(all.windowHeight, 650, 'windowHeight default should be 650');
  assert.strictEqual(all.undetectable, true, 'undetectable should default to true');
  assert.strictEqual(all.focusable, true, 'focusable should default to true');
  assert.strictEqual(all.clickThrough, false, 'clickThrough should default to false');
  assert.strictEqual(all.autoSubmit, false, 'autoSubmit should default to false');
  assert.strictEqual(all.opacity, 0.95, 'opacity should default to 0.95');
});

suite.test('Store contains complete prompt instructions', () => {
  const testStore = new SettingsStore(tempSettingsFile);
  const prompt = testStore.get('prompt');
  assert.ok(typeof prompt === 'string', 'prompt should be a string');
  assert.ok(prompt.length > 20, 'prompt should be descriptive');
  assert.ok(prompt.toLowerCase().includes('question') || prompt.toLowerCase().includes('image'), 'prompt should mention image analysis');
});

suite.test('Store contains all 14 WhisprGPT shortcut key bindings', () => {
  const testStore = new SettingsStore(tempSettingsFile);
  const shortcuts = testStore.get('shortcuts');
  assert.ok(shortcuts, 'shortcuts object must exist');

  const requiredShortcuts = [
    'screenshot',
    'send',
    'toggleVisibility',
    'toggleFocus',
    'toggleClickThrough',
    'moveUp',
    'moveDown',
    'moveLeft',
    'moveRight',
    'scrollUp',
    'scrollDown',
    'opacityDown',
    'opacityUp',
    'emergencyExit'
  ];

  for (const key of requiredShortcuts) {
    assert.ok(shortcuts[key], `Shortcut '${key}' must be defined`);
    assert.ok(typeof shortcuts[key] === 'string', `Shortcut '${key}' must be an accelerator string`);
  }

  assert.strictEqual(shortcuts.screenshot, 'CommandOrControl+S');
  assert.strictEqual(shortcuts.send, 'CommandOrControl+Return');
  assert.strictEqual(shortcuts.toggleVisibility, 'CommandOrControl+H');
  assert.strictEqual(shortcuts.toggleFocus, 'CommandOrControl+F');
  assert.strictEqual(shortcuts.toggleClickThrough, 'CommandOrControl+M');
  assert.strictEqual(shortcuts.emergencyExit, 'CommandOrControl+Shift+Q');
});

suite.test('Store set and get persist key-value pairs', () => {
  const testStore = new SettingsStore(tempSettingsFile);
  testStore.set('opacity', 0.75);
  assert.strictEqual(testStore.get('opacity'), 0.75, 'store.set should immediately update get()');
});

suite.test('Store update performs deep merge on shortcuts', () => {
  const testStore = new SettingsStore(tempSettingsFile);
  const originalShortcuts = { ...testStore.get('shortcuts') };

  testStore.update({
    shortcuts: {
      screenshot: 'CommandOrControl+Shift+S'
    }
  });

  const updated = testStore.get('shortcuts');
  assert.strictEqual(updated.screenshot, 'CommandOrControl+Shift+S', 'screenshot key should update');
  assert.strictEqual(updated.send, originalShortcuts.send, 'unmodified shortcuts must be preserved');
  assert.strictEqual(updated.toggleFocus, originalShortcuts.toggleFocus, 'toggleFocus must be preserved');
});

app.whenReady().then(async () => {
  try {
    // Also ensure singleton store has clean defaults for other suites
    store.set('clickThrough', false);
    store.set('opacity', 0.95);
    store.flush();

    const success = await suite.run();
    app.exit(success ? 0 : 1);
  } finally {
    if (fs.existsSync(tempSettingsFile)) {
      try { fs.unlinkSync(tempSettingsFile); } catch (e) {}
    }
  }
});
