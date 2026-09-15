import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from '../../src/main/store.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suite = createTestSuite('Tier 2/3: DOM Trigger Sequence & Click Interceptor');

let win = null;

const samplePngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

suite.test('Upload triggers 2-step sequence and intercepts file input click', async () => {
  ipcMain.removeHandler('get-focusable');
  ipcMain.removeHandler('get-click-through');
  ipcMain.removeHandler('get-settings');

  ipcMain.handle('get-focusable', () => true);
  ipcMain.handle('get-click-through', () => false);
  ipcMain.handle('get-settings', () => store.getAll());

  win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../../src/preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const fixturePath = path.join(__dirname, '../fixtures/gemini_mock.html');
  await win.loadFile(fixturePath);
  await new Promise((r) => setTimeout(r, 200));

  const uploadResult = await win.webContents.executeJavaScript(`
    (async () => {
      if (!window.upload || !window.upload.uploadImage) {
        throw new Error('window.upload.uploadImage is not exposed');
      }

      await window.upload.uploadImage({
        strategy: {
          type: 'triggerSequence',
          triggerSelectors: [
            '[aria-label="Upload & tools"]',
            '[data-test-id="hidden-local-file-upload-button"]'
          ],
          waitTimeoutMs: 800,
          clickGapMs: 100
        },
        dataUrl: '${samplePngDataUrl}'
      });

      return {
        events: window.__testEvents,
        filesCount: document.getElementById('upload-file-input').files.length
      };
    })()
  `);

  console.log('Upload Result from DOM:', uploadResult);

  assert.ok(uploadResult.events.uploadToolsClicked >= 1, 'Step 1: Upload & tools button was clicked');
  assert.strictEqual(uploadResult.filesCount, 1, 'File input must contain 1 attached file');
  assert.ok(uploadResult.events.fileInjected, 'File change event was dispatched');
  assert.strictEqual(uploadResult.events.fileInjected.name, 'screenshot.png', 'File name should be screenshot.png');
});

suite.test('Prompt text injection populates rich-textarea editor', async () => {
  const testPrompt = 'Solve this math equation step by step: 2x + 5 = 15';

  const injectResult = await win.webContents.executeJavaScript(`
    (async () => {
      const ok = await window.upload.uploadPrompt(${JSON.stringify(testPrompt)});
      const editor = document.querySelector('.ql-editor');
      return {
        ok,
        text: editor.innerText || editor.textContent
      };
    })()
  `);

  assert.strictEqual(injectResult.ok, true, 'uploadPrompt must return true');
  assert.ok(injectResult.text.includes('2x + 5 = 15'), 'Editor content must contain injected prompt text');
});

app.whenReady().then(async () => {
  try {
    const success = await suite.run();
    if (win && !win.isDestroyed()) {
      win.close();
    }
    process.exit(success ? 0 : 1);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
