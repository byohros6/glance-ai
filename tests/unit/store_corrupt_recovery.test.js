import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { store } from '../../src/main/store.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const suite = createTestSuite('Tier 2: Corrupt Store Recovery');

const settingsPath = path.join(app.getPath('userData'), 'undecgpt_settings.json');
let backupData = null;

suite.test('Corrupted syntax JSON recovery', () => {
  if (fs.existsSync(settingsPath)) {
    backupData = fs.readFileSync(settingsPath, 'utf-8');
  }

  // Inject invalid syntax
  fs.writeFileSync(settingsPath, '{"broken_json": [missing_bracket', 'utf-8');

  // Reload store
  assert.doesNotThrow(() => {
    store.load();
  }, 'store.load() must not throw on corrupted JSON');

  const settings = store.getAll();
  assert.strictEqual(settings.windowWidth, 520, 'Should fall back to default windowWidth');
  assert.strictEqual(settings.opacity, 0.95, 'Should fall back to default opacity');
  assert.ok(settings.shortcuts && settings.shortcuts.screenshot, 'Should restore default shortcuts');
});

suite.test('Empty 0-byte file recovery', () => {
  fs.writeFileSync(settingsPath, '', 'utf-8');

  assert.doesNotThrow(() => {
    store.load();
  }, 'store.load() must not throw on 0-byte empty file');

  const settings = store.getAll();
  assert.strictEqual(settings.windowWidth, 520, 'Should fall back to default windowWidth');
});

suite.test('Partial JSON file preserves defaults for missing keys', () => {
  // Write valid JSON with only one property and missing shortcuts
  fs.writeFileSync(settingsPath, JSON.stringify({ windowWidth: 800 }), 'utf-8');

  store.load();
  const settings = store.getAll();
  assert.strictEqual(settings.windowWidth, 800, 'Explicit property must be loaded');
  assert.strictEqual(settings.windowHeight, 650, 'Missing windowHeight must default to 650');
  assert.strictEqual(settings.opacity, 0.95, 'Missing opacity must default to 0.95');
  assert.ok(settings.shortcuts && settings.shortcuts.screenshot, 'Missing shortcuts must be filled');
});

suite.test('Store can cleanly save and self-heal after corruption', () => {
  store.save();
  assert.doesNotThrow(() => {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    assert.ok(parsed && parsed.shortcuts, 'Saved JSON must be valid and intact');
  }, 'Corrupted file must be healed with valid JSON after save');
});

app.whenReady().then(async () => {
  try {
    const success = await suite.run();
    process.exit(success ? 0 : 1);
  } finally {
    if (backupData) {
      fs.writeFileSync(settingsPath, backupData, 'utf-8');
    }
  }
});
