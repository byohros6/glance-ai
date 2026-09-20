import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from '../../src/main/store.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suite = createTestSuite('Tier 1/2: Multi-Provider DOM Ingestion, Injection & Submit');

let win = null;

const samplePngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function loadFixture(fixtureName) {
  if (!win || win.isDestroyed()) {
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
        sandbox: false
      }
    });
  }

  const fixturePath = path.join(__dirname, `../fixtures/${fixtureName}`);
  await win.loadFile(fixturePath);
  await new Promise((r) => setTimeout(r, 200));
  return win;
}

// 1. Provider Detection Suite
suite.test('Provider detection resolves all 4 domains, mock fixtures, and DOM heuristics', async () => {
  await loadFixture('gemini_mock.html');

  const detectionResults = await win.webContents.executeJavaScript(`
    (() => {
      const detect = window.upload.detectProvider;
      return {
        geminiUrl: detect('https://gemini.google.com/app'),
        chatgptUrl: detect('https://chatgpt.com/'),
        openaiUrl: detect('https://chat.openai.com/c/12345'),
        claudeUrl: detect('https://claude.ai/new'),
        perplexityUrl: detect('https://www.perplexity.ai/'),
        perplexitySubUrl: detect('https://perplexity.ai/search?q=test'),
        geminiMock: detect('file:///fixtures/gemini_mock.html'),
        chatgptMock: detect('file:///fixtures/chatgpt_mock.html'),
        claudeMock: detect('file:///fixtures/claude_mock.html'),
        perplexityMock: detect('file:///fixtures/perplexity_mock.html')
      };
    })()
  `);

  assert.strictEqual(detectionResults.geminiUrl, 'gemini', 'gemini.google.com must detect gemini');
  assert.strictEqual(detectionResults.chatgptUrl, 'chatgpt', 'chatgpt.com must detect chatgpt');
  assert.strictEqual(detectionResults.openaiUrl, 'chatgpt', 'chat.openai.com must detect chatgpt');
  assert.strictEqual(detectionResults.claudeUrl, 'claude', 'claude.ai must detect claude');
  assert.strictEqual(detectionResults.perplexityUrl, 'perplexity', 'perplexity.ai must detect perplexity');
  assert.strictEqual(detectionResults.perplexitySubUrl, 'perplexity', 'perplexity search url must detect perplexity');
  assert.strictEqual(detectionResults.geminiMock, 'gemini', 'gemini_mock must detect gemini');
  assert.strictEqual(detectionResults.chatgptMock, 'chatgpt', 'chatgpt_mock must detect chatgpt');
  assert.strictEqual(detectionResults.claudeMock, 'claude', 'claude_mock must detect claude');
  assert.strictEqual(detectionResults.perplexityMock, 'perplexity', 'perplexity_mock must detect perplexity');
});

// 2. ChatGPT Ingestion, Injection & Submission
suite.test('ChatGPT: Direct paste, prompt injection, send button click & Enter fallback', async () => {
  await loadFixture('chatgpt_mock.html');

  // Verify provider detection on loaded mock
  const provider = await win.webContents.executeJavaScript('window.upload.detectProvider()');
  assert.strictEqual(provider, 'chatgpt', 'ChatGPT mock must be detected as chatgpt');

  // Screenshot upload via synthetic paste directly into #prompt-textarea
  const uploadResult = await win.webContents.executeJavaScript(`
    (async () => {
      await window.upload.uploadImage('${samplePngDataUrl}');
      return window.__testEvents.pastedFile;
    })()
  `);

  assert.ok(uploadResult, 'ChatGPT editor must receive paste event');
  assert.strictEqual(uploadResult.name, 'screenshot.png', 'Pasted file must be named screenshot.png');

  // Prompt injection
  const promptText = 'Solve this algorithm in Python: def solve(x): return x * 2';
  const promptResult = await win.webContents.executeJavaScript(`
    (async () => {
      const ok = await window.upload.uploadPrompt(${JSON.stringify(promptText)});
      const editor = document.getElementById('prompt-textarea');
      return {
        ok,
        text: editor.innerText || editor.textContent,
        eventText: window.__testEvents.editorInput
      };
    })()
  `);

  assert.strictEqual(promptResult.ok, true, 'uploadPrompt must return true for ChatGPT');
  assert.ok(promptResult.text.includes('def solve(x)'), 'ChatGPT editor must contain prompt text');

  // Submit via send button
  const submitResult = await win.webContents.executeJavaScript(`
    (async () => {
      const ok = await window.upload.submitPrompt();
      return {
        ok,
        sendClicks: window.__testEvents.sendClicked
      };
    })()
  `);

  assert.strictEqual(submitResult.ok, true, 'submitPrompt must return true for ChatGPT');
  assert.strictEqual(submitResult.sendClicks, 1, 'ChatGPT send button must be clicked');

  // Submit fallback to Enter keydown
  const fallbackResult = await win.webContents.executeJavaScript(`
    (async () => {
      const btn = document.getElementById('send-btn');
      btn.setAttribute('disabled', 'true');
      const ok = await window.upload.submitPrompt();
      btn.removeAttribute('disabled');
      return {
        ok,
        enterEvents: window.__testEvents.enterKeyDownDispatched
      };
    })()
  `);

  assert.strictEqual(fallbackResult.ok, false, 'A disabled send control must not be bypassed');
  assert.strictEqual(fallbackResult.enterEvents, 0, 'No fallback is allowed when Send is explicitly disabled');
});

// 3. Claude Ingestion, Injection & Submission
suite.test('Claude: Paste DataTransfer, file input attach, prompt injection & send submit', async () => {
  await loadFixture('claude_mock.html');

  const provider = await win.webContents.executeJavaScript('window.upload.detectProvider()');
  assert.strictEqual(provider, 'claude', 'Claude mock must be detected as claude');

  // Screenshot upload via DataTransfer paste into ProseMirror
  const pasteResult = await win.webContents.executeJavaScript(`
    (async () => {
      await window.upload.uploadImage('${samplePngDataUrl}');
      return window.__testEvents.pastedFile;
    })()
  `);

  assert.ok(pasteResult, 'Claude ProseMirror must receive paste event with DataTransfer');
  assert.strictEqual(pasteResult.name, 'screenshot.png', 'Pasted file must be screenshot.png');

  // Direct file input injection on Claude
  const fileInputResult = await win.webContents.executeJavaScript(`
    (async () => {
      await window.upload.uploadScreenshotToClaude({
        dataUrl: '${samplePngDataUrl}',
        preferFileInput: true
      });
      return window.__testEvents.fileInjected;
    })()
  `);

  assert.ok(fileInputResult, 'Claude file input must receive injected file');
  assert.strictEqual(fileInputResult.name, 'screenshot.png', 'Injected file must be named screenshot.png');

  // Prompt injection into ProseMirror
  const claudePrompt = 'Analyze the computational complexity of Dijkstra algorithm';
  const promptResult = await win.webContents.executeJavaScript(`
    (async () => {
      const ok = await window.upload.uploadPrompt(${JSON.stringify(claudePrompt)});
      const editor = document.querySelector('.ProseMirror');
      return {
        ok,
        text: editor.innerText || editor.textContent
      };
    })()
  `);

  assert.strictEqual(promptResult.ok, true, 'uploadPrompt must return true for Claude');
  assert.ok(promptResult.text.includes('Dijkstra algorithm'), 'Claude ProseMirror must contain prompt');

  // Submit via Send Message button
  const submitResult = await win.webContents.executeJavaScript(`
    (async () => {
      const ok = await window.upload.submitPrompt();
      return {
        ok,
        sendClicks: window.__testEvents.sendClicked
      };
    })()
  `);

  assert.strictEqual(submitResult.ok, true, 'submitPrompt must return true for Claude');
  assert.strictEqual(submitResult.sendClicks, 1, 'Claude Send Message button must be clicked');

  // Submit fallback to Enter
  const fallbackResult = await win.webContents.executeJavaScript(`
    (async () => {
      const btn = document.getElementById('send-btn');
      btn.setAttribute('disabled', 'true');
      const ok = await window.upload.submitPrompt();
      btn.removeAttribute('disabled');
      return {
        ok,
        enterEvents: window.__testEvents.enterKeyDownDispatched
      };
    })()
  `);

  assert.strictEqual(fallbackResult.ok, false, 'A disabled send control must not be bypassed');
  assert.strictEqual(fallbackResult.enterEvents, 0, 'No fallback is allowed when Send is explicitly disabled');
});

// 4. Perplexity Ingestion, Injection & Submission
suite.test('Perplexity: File input, dropzone drop, textarea prompt injection & submit', async () => {
  await loadFixture('perplexity_mock.html');

  const provider = await win.webContents.executeJavaScript('window.upload.detectProvider()');
  assert.strictEqual(provider, 'perplexity', 'Perplexity mock must be detected as perplexity');

  // File input injection
  const fileResult = await win.webContents.executeJavaScript(`
    (async () => {
      await window.upload.uploadImage('${samplePngDataUrl}');
      return window.__testEvents.fileInjected;
    })()
  `);

  assert.ok(fileResult, 'Perplexity file input must receive screenshot');
  assert.strictEqual(fileResult.name, 'screenshot.png', 'Attached file must be screenshot.png');

  // Dropzone injection test
  const dropResult = await win.webContents.executeJavaScript(`
    (async () => {
      const inp = document.getElementById('perplexity-file-input');
      if (inp) inp.remove();

      await window.upload.uploadScreenshotToPerplexity('${samplePngDataUrl}');
      return window.__testEvents.droppedFile;
    })()
  `);

  assert.ok(dropResult, 'Perplexity dropzone must receive DragEvent drop with DataTransfer');
  assert.strictEqual(dropResult.name, 'screenshot.png', 'Dropped file must be screenshot.png');

  // Prompt injection into textarea
  const perplexityPrompt = 'Find recent papers on transformer attention mechanics';
  const promptResult = await win.webContents.executeJavaScript(`
    (async () => {
      const ok = await window.upload.uploadPrompt(${JSON.stringify(perplexityPrompt)});
      const textarea = document.querySelector('textarea');
      return {
        ok,
        val: textarea.value,
        eventVal: window.__testEvents.editorInput
      };
    })()
  `);

  assert.strictEqual(promptResult.ok, true, 'uploadPrompt must return true for Perplexity');
  assert.ok(promptResult.val.includes('transformer attention'), 'Perplexity textarea must contain prompt');

  // Submit via Submit button
  const submitResult = await win.webContents.executeJavaScript(`
    (async () => {
      const ok = await window.upload.submitPrompt();
      return {
        ok,
        sendClicks: window.__testEvents.sendClicked
      };
    })()
  `);

  assert.strictEqual(submitResult.ok, true, 'submitPrompt must return true for Perplexity');
  assert.strictEqual(submitResult.sendClicks, 1, 'Perplexity Submit button must be clicked');

  // Submit fallback to Enter
  const fallbackResult = await win.webContents.executeJavaScript(`
    (async () => {
      const btn = document.getElementById('submit-btn');
      btn.setAttribute('disabled', 'true');
      const ok = await window.upload.submitPrompt();
      btn.removeAttribute('disabled');
      return {
        ok,
        enterEvents: window.__testEvents.enterKeyDownDispatched
      };
    })()
  `);

  assert.strictEqual(fallbackResult.ok, false, 'A disabled send control must not be bypassed');
  assert.strictEqual(fallbackResult.enterEvents, 0, 'No fallback is allowed when Send is explicitly disabled');
});

// 5. Universal Fallback Paste Mechanics
suite.test('Universal Fallback: Dispatches synthetic clipboard paste on active focused contenteditable', async () => {
  await loadFixture('gemini_mock.html');

  const fallbackResult = await win.webContents.executeJavaScript(`
    (async () => {
      document.body.innerHTML = \`
        <h2>Generic Unidentified Web App</h2>
        <div id="generic-editor" contenteditable="true" style="min-height:50px; border:1px solid #ccc; padding:10px;"></div>
      \`;

      let pasteReceived = false;
      let pastedName = null;

      const editor = document.getElementById('generic-editor');
      editor.addEventListener('paste', (e) => {
        pasteReceived = true;
        if (e.clipboardData && e.clipboardData.files.length > 0) {
          pastedName = e.clipboardData.files[0].name;
        }
      });

      editor.focus();

      const ok = await window.upload.fallbackSyntheticPaste('${samplePngDataUrl}');

      return {
        ok,
        pasteReceived,
        pastedName
      };
    })()
  `);

  assert.strictEqual(fallbackResult.ok, true, 'Visible attachment confirms the paste');
  assert.strictEqual(fallbackResult.pasteReceived, true, 'Active focused element must receive synthetic paste event');
  assert.strictEqual(fallbackResult.pastedName, 'screenshot.png', 'Clipboard data must contain standard PNG file blob');
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
