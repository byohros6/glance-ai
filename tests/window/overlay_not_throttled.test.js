import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTestSuite, assert } from '../helpers/test_suite.js';

// Regression: a streaming provider reply froze on the thinking dots when the
// overlay was non-activating (not the foreground window), because Chromium
// backgrounded the renderer. The overlay must keep its renderer unthrottled.
const suite = createTestSuite('Overlay renderer is never backgrounded');

suite.test('Importing the app sets the no-backgrounding switches', async () => {
  await import(pathToFileURL(path.resolve('src/main/main.js')).href);
  assert.ok(app.commandLine.hasSwitch('disable-renderer-backgrounding'), 'disable-renderer-backgrounding');
  assert.ok(app.commandLine.hasSwitch('disable-background-timer-throttling'), 'disable-background-timer-throttling');
  assert.ok(app.commandLine.hasSwitch('disable-backgrounding-occluded-windows'), 'disable-backgrounding-occluded-windows');
});

suite.test('The overlay window is created with backgroundThrottling disabled', () => {
  // getLastWebPreferences does not expose backgroundThrottling, so assert the overlay
  // BrowserWindow options in source carry it. This is the only overlay constructor.
  const src = fs.readFileSync(path.resolve('src/main/main.js'), 'utf8');
  const overlayLine = src.split('\n').find(l => l.includes("new BrowserWindow(") && l.includes("spellcheck: true"));
  assert.ok(overlayLine, 'overlay constructor found');
  assert.ok(/backgroundThrottling:\s*false/.test(overlayLine), 'overlay sets backgroundThrottling:false');
});

app.whenReady().then(async () => { const ok = await suite.run(); app.exit(ok ? 0 : 1); });