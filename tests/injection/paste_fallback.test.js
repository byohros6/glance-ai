import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from '../../src/main/store.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suite = createTestSuite('Tier 2: Direct Input & Synthetic Paste Fallback');

let win = null;

const samplePngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

suite.test('Direct input fallback injects screenshot when trigger selectors fail', async () => {
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

  // Trigger upload with invalid selector to force fallback to document.querySelectorAll('input[type="file"]')
  const fallbackResult = await win.webContents.executeJavaScript(`
    (async () => {
      // Clear file input first
      const input = document.getElementById('upload-file-input');
      input.value = '';

      // Use nonexistent selectors
      await window.upload.uploadImage({
        strategy: {
          type: 'triggerSequence',
          triggerSelectors: [
            '.nonexistent-button-1',
            '.nonexistent-button-2'
          ],
          waitTimeoutMs: 100,
          clickGapMs: 50
        },
        dataUrl: '${samplePngDataUrl}'
      });

      return {
        filesCount: input.files ? input.files.length : 0,
        fileName: input.files && input.files[0] ? input.files[0].name : null
      };
    })()
  `);

  assert.strictEqual(fallbackResult.filesCount, 1, 'Direct input fallback must attach 1 file');
  assert.strictEqual(fallbackResult.fileName, 'screenshot.png', 'Attached file must be named screenshot.png');
});

suite.test('Synthetic clipboard paste fallback triggers paste event on editor', async () => {
  const pasteResult = await win.webContents.executeJavaScript(`
    (async () => {
      let pasteEventReceived = false;
      let pastedFileName = null;

      const editor = document.querySelector('.ql-editor');
      editor.addEventListener('paste', (e) => {
        pasteEventReceived = true;
        if (e.clipboardData && e.clipboardData.files.length > 0) {
          pastedFileName = e.clipboardData.files[0].name;
        }
      });

      // Remove input[type="file"] elements temporarily to force clipboard paste fallback
      const fileInputs = document.querySelectorAll('input[type="file"]');
      const removed = [];
      fileInputs.forEach((inp) => {
        removed.push({ parent: inp.parentNode, el: inp });
        inp.remove();
      });

      await window.upload.uploadImage({
        strategy: {
          type: 'triggerSequence',
          triggerSelectors: ['.nonexistent-1', '.nonexistent-2'],
          waitTimeoutMs: 100,
          clickGapMs: 50
        },
        dataUrl: '${samplePngDataUrl}'
      });

      // Restore inputs
      removed.forEach(({ parent, el }) => parent.appendChild(el));

      return {
        pasteEventReceived,
        pastedFileName
      };
    })()
  `);

  assert.strictEqual(pasteResult.pasteEventReceived, true, 'Synthetic paste event must be dispatched to editor');
  assert.strictEqual(pasteResult.pastedFileName, 'screenshot.png', 'Clipboard data must contain screenshot.png');
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
