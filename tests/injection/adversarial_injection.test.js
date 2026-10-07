import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { store } from '../../src/main/store.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suite = createTestSuite('Milestone 2 Injection Challenger: Adversarial DOM Injection & Submit Engine');

let win = null;

const samplePngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

suite.test('Production preload loads in its isolated context', async () => {
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
      additionalArguments: ['--glance-test-api'],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const fixturePath = path.join(__dirname, '../fixtures/gemini_mock.html');
  await win.loadFile(fixturePath);
  await new Promise((r) => setTimeout(r, 200));

  assert.ok(win && !win.isDestroyed(), 'Production preload loaded');
});

suite.test('Preload uploadViaTriggerSequence arms main-world interceptor and suppresses native click', async () => {
  const result = await win.webContents.executeJavaScript(`
    (async () => {
      // Clear file input
      const fileInput = document.getElementById('upload-file-input');
      fileInput.value = '';

      // Track if original click gets called
      let nativeClickCalled = false;
      const nativeClick = HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click = function() {
        if (this.type === 'file') {
          nativeClickCalled = true;
        }
        return nativeClick.apply(this, arguments);
      };

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
        filesCount: fileInput.files.length,
        fileName: fileInput.files.length > 0 ? fileInput.files[0].name : null,
        nativeClickCalled,
        interceptorState: window.__glance_interceptor_state
      };
    })()
  `);

  assert.strictEqual(result.filesCount, 1, 'Preload trigger sequence attached 1 file');
  assert.strictEqual(result.fileName, 'screenshot.png', 'Attached file is screenshot.png');
  assert.strictEqual(result.nativeClickCalled, false, 'Native file picker click was suppressed by interceptor');
});

suite.test('2-Step Trigger sequence handles dynamic DOM elements and triggers main-world interceptor', async () => {
  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const input = document.getElementById('upload-file-input');
      input.value = '';

      window.__testEvents.uploadToolsClicked = 0;
      window.__testEvents.fileInjected = null;

      // Create a dynamic button that appears after 150ms
      const dynamicBtn = document.createElement('button');
      dynamicBtn.setAttribute('aria-label', 'Dynamic upload button');
      dynamicBtn.style.display = 'none';
      document.body.appendChild(dynamicBtn);

      setTimeout(() => {
        dynamicBtn.style.display = 'block';
      }, 150);

      await window.upload.uploadImage({
        strategy: {
          type: 'triggerSequence',
          triggerSelectors: [
            '[aria-label="Dynamic upload button"]',
            '[data-test-id="hidden-local-file-upload-button"]'
          ],
          waitTimeoutMs: 1000,
          clickGapMs: 100
        },
        dataUrl: '${samplePngDataUrl}'
      });

      return {
        filesCount: input.files ? input.files.length : 0,
        fileName: input.files && input.files[0] ? input.files[0].name : null,
        fileInjectedEvent: !!window.__testEvents.fileInjected
      };
    })()
  `);

  assert.strictEqual(result.filesCount, 1, 'Dynamic 2-step sequence attached file');
  assert.strictEqual(result.fileName, 'screenshot.png', 'Attached file is screenshot.png');
  assert.strictEqual(result.fileInjectedEvent, true, 'Change event dispatched');
});

suite.test('Button-triggered upload intercepts the file picker and restores its prototype', async () => {
  const result = await win.webContents.executeJavaScript(`(async () => {
    const input = document.getElementById('upload-file-input');
    input.value = '';
    const original = HTMLInputElement.prototype.click;
    const button = document.createElement('button');
    button.id = 'picker-trigger-regression';
    button.onclick = () => input.click();
    document.body.append(button);
    try {
      const ok = await window.upload.uploadImage({dataUrl: '${samplePngDataUrl}', strategy: {
        type: 'triggerSequence', triggerSelectors: ['#picker-trigger-regression'], clickGapMs: 60
      }});
      return { ok, count: input.files.length, restored: HTMLInputElement.prototype.click === original };
    } finally { button.remove(); }
  })()`);
  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  assert.equal(result.restored, true);
});

suite.test('Direct input fallback activates when trigger selectors fail completely', async () => {
  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const input = document.getElementById('upload-file-input');
      input.value = '';

      await window.upload.uploadImage({
        strategy: {
          type: 'triggerSequence',
          triggerSelectors: [
            '#completely-missing-step1',
            '#completely-missing-step2'
          ],
          waitTimeoutMs: 50,
          clickGapMs: 20
        },
        dataUrl: '${samplePngDataUrl}'
      });

      return {
        filesCount: input.files ? input.files.length : 0,
        fileName: input.files && input.files[0] ? input.files[0].name : null
      };
    })()
  `);

  assert.strictEqual(result.filesCount, 1, 'Direct input fallback successfully injected file');
  assert.strictEqual(result.fileName, 'screenshot.png', 'File name is screenshot.png');
});

suite.test('Synthetic paste fallback dispatches ClipboardEvent when file inputs are missing', async () => {
  const result = await win.webContents.executeJavaScript(`
    (async () => {
      let pasteDispatched = false;
      let pasteItemCount = 0;
      let pasteFileName = '';

      const editor = document.querySelector('.ql-editor');
      const onPaste = (e) => {
        pasteDispatched = true;
        if (e.clipboardData && e.clipboardData.files) {
          pasteItemCount = e.clipboardData.files.length;
          if (pasteItemCount > 0) pasteFileName = e.clipboardData.files[0].name;
        }
      };
      editor.addEventListener('paste', onPaste);

      // Remove all file inputs
      const allInputs = Array.from(document.querySelectorAll('input[type="file"]'));
      const detached = allInputs.map(inp => {
        const p = inp.parentNode;
        inp.remove();
        return { p, inp };
      });

      try {
        await window.upload.uploadImage({
          strategy: {
            type: 'triggerSequence',
            triggerSelectors: ['#missing-1', '#missing-2'],
            waitTimeoutMs: 50,
            clickGapMs: 20
          },
          dataUrl: '${samplePngDataUrl}'
        });
      } finally {
        detached.forEach(({ p, inp }) => p.appendChild(inp));
        editor.removeEventListener('paste', onPaste);
      }

      return {
        pasteDispatched,
        pasteItemCount,
        pasteFileName
      };
    })()
  `);

  assert.strictEqual(result.pasteDispatched, true, 'Synthetic paste event must be dispatched to editor');
  assert.strictEqual(result.pasteItemCount, 1, 'ClipboardData must have 1 file');
  assert.strictEqual(result.pasteFileName, 'screenshot.png', 'Pasted file name must be screenshot.png');
});

suite.test('Submit engine retries when send button is initially disabled and clicks when enabled', async () => {
  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const sendBtn = document.getElementById('send-btn');
      sendBtn.setAttribute('disabled', 'true');
      let clickCountBefore = window.__testEvents.sendClicked;

      // Enable after 450ms (within 8 * 200ms = 1600ms window)
      setTimeout(() => {
        sendBtn.removeAttribute('disabled');
      }, 450);

      const startTime = Date.now();
      const ok = await window.upload.submitPrompt();
      const elapsed = Date.now() - startTime;
      const clickCountAfter = window.__testEvents.sendClicked;

      return {
        ok,
        elapsed,
        clickCountBefore,
        clickCountAfter,
        clicked: clickCountAfter > clickCountBefore
      };
    })()
  `);

  assert.strictEqual(result.ok, true, 'submitPrompt must succeed when button becomes enabled');
  assert.strictEqual(result.clicked, true, 'Send button must receive click event after becoming enabled');
  assert.ok(result.elapsed >= 400, 'Must have waited for retry interval before clicking');
});

suite.test('Submit engine retries when aria-disabled="true" and succeeds once cleared', async () => {
  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const sendBtn = document.getElementById('send-btn');
      sendBtn.setAttribute('aria-disabled', 'true');
      let clickCountBefore = window.__testEvents.sendClicked;

      setTimeout(() => {
        sendBtn.removeAttribute('aria-disabled');
      }, 350);

      const ok = await window.upload.submitPrompt();
      const clickCountAfter = window.__testEvents.sendClicked;

      return {
        ok,
        clicked: clickCountAfter > clickCountBefore
      };
    })()
  `);

  assert.strictEqual(result.ok, true, 'submitPrompt handles aria-disabled');
  assert.strictEqual(result.clicked, true, 'Send button clicked once aria-disabled removed');
});

suite.test('Submit engine respects disabled Send after retries', async () => {
  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const sendBtn = document.getElementById('send-btn');
      sendBtn.setAttribute('disabled', 'true');
      window.__testEvents.enterKeyDownDispatched = 0;

      const startTime = Date.now();
      const ok = await window.upload.submitPrompt();
      const elapsed = Date.now() - startTime;
      const enterCount = window.__testEvents.enterKeyDownDispatched;

      sendBtn.removeAttribute('disabled');

      return {
        ok,
        elapsed,
        enterCount
      };
    })()
  `);

  assert.strictEqual(result.ok, false, 'Disabled Send must not be bypassed');
  assert.strictEqual(result.enterCount, 0, 'No synthetic Enter while Send is disabled');
  assert.ok(result.elapsed >= 1500, 'Must have exhausted 8 retries (~1600ms) before Enter fallback');
});

suite.test('Submit engine returns false gracefully if neither send button nor editor exists', async () => {
  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const sendBtn = document.getElementById('send-btn');
      const editor = document.querySelector('rich-textarea');
      const sendParent = sendBtn.parentNode;
      const editorParent = editor.parentNode;

      sendBtn.remove();
      editor.remove();

      let ok = null;
      try {
        ok = await window.upload.submitPrompt();
      } finally {
        sendParent.appendChild(sendBtn);
        editorParent.appendChild(editor);
      }

      return { ok };
    })()
  `);

  assert.strictEqual(result.ok, false, 'submitPrompt returns false gracefully when no submit target exists');
});

app.whenReady().then(async () => {
  try {
    const success = await suite.run();
    if (win && !win.isDestroyed()) {
      win.close();
    }
    app.exit(success ? 0 : 1);
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
