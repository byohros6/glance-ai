const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Expose API to renderer
const glanceApi = {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  setOpacity: (val) => ipcRenderer.invoke('set-opacity', val),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  closeApp: () => ipcRenderer.invoke('close-app'),
  captureScreen: () => ipcRenderer.invoke('take-screenshot'),
  setFocusable: (val) => ipcRenderer.invoke('set-focusable', val),
  getFocusable: () => ipcRenderer.invoke('get-focusable'),
  setClickThrough: (val) => ipcRenderer.invoke('set-click-through', val),
  getClickThrough: () => ipcRenderer.invoke('get-click-through'),
  setIgnoreMouseEvents: (ignore, opts) => ipcRenderer.invoke('set-ignore-mouse-events', ignore, opts),
  launchGemini: () => ipcRenderer.invoke('launch-gemini'),
  launchOverlay: () => ipcRenderer.invoke('launch-overlay'),
  openDashboard: () => ipcRenderer.invoke('open-dashboard'),
  getAppMode: () => ipcRenderer.invoke('get-app-mode'),
  updateShortcut: (action, accelerator) => ipcRenderer.invoke('update-shortcut', { action, accelerator }),
  resetShortcuts: () => ipcRenderer.invoke('reset-shortcuts'),
  pauseShortcuts: () => ipcRenderer.invoke('pause-shortcuts'),
  resumeShortcuts: () => ipcRenderer.invoke('resume-shortcuts'),
  previewOverlaySize: (width, height) => ipcRenderer.invoke('preview-overlay-size', { width, height }),
  onShortcutAction: (callback) => {
    ipcRenderer.on('shortcut-action', (_event, action, payload) => callback(action, payload));
  }
};

contextBridge.exposeInMainWorld('undecgpt', glanceApi);
contextBridge.exposeInMainWorld('glanceai', glanceApi);

// Synchronous click-through tracking to eliminate async IPC race conditions
let isClickThroughActive = false;

// Helper: wait for element
function waitForElement(selector, timeoutMs = 4000) {
  const el = document.querySelector(selector);
  if (el) return Promise.resolve(el);

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const match = document.querySelector(selector);
      if (match) {
        observer.disconnect();
        resolve(match);
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

// Convert base64 Data URL to standard File object
function dataUrlToFile(dataUrl, filename = 'screenshot.png') {
  const parts = dataUrl.split(',');
  const meta = parts[0] || '';
  const b64 = parts[1] || '';
  const mime = (meta.split(':')[1] || 'image/png').split(';')[0];
  const byteString = atob(b64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: mime });
  return new File([blob], filename, { type: mime });
}

// Injects File into HTMLInputElement and dispatches input & change events
function injectFileFromDataUrl(input, dataUrl, filename = 'screenshot.png') {
  if (!input) return false;
  const file = dataUrlToFile(dataUrl, filename);
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// Helper: synthetic clipboard paste of image blob directly into a DOM element
function pasteImageBlob(target, dataUrl, filename = 'screenshot.png') {
  if (!target) return false;
  try {
    const file = dataUrlToFile(dataUrl, filename);
    const dt = new DataTransfer();
    dt.items.add(file);
    if (typeof target.focus === 'function') target.focus();
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt
    });
    return target.dispatchEvent(pasteEvent);
  } catch (err) {
    console.warn('[GlanceAI] pasteImageBlob error:', err);
    return false;
  }
}

// Universal fallback: Synthesize clipboard paste event (new ClipboardEvent('paste'))
// with standard PNG file blob on whichever active contenteditable or textarea currently has focus.
function fallbackSyntheticPaste(dataUrl, filename = 'screenshot.png') {
  try {
    const file = dataUrlToFile(dataUrl, filename);
    const dt = new DataTransfer();
    dt.items.add(file);

    let target = document.activeElement;
    if (
      !target ||
      target === document.body ||
      target === document.documentElement ||
      (!target.isContentEditable &&
        target.getAttribute('contenteditable') !== 'true' &&
        target.tagName !== 'TEXTAREA' &&
        target.tagName !== 'INPUT')
    ) {
      target =
        document.querySelector('div[contenteditable="true"]#prompt-textarea') ||
        document.querySelector('div.ProseMirror[contenteditable="true"]') ||
        document.querySelector('rich-textarea .ql-editor') ||
        document.querySelector('.ql-editor') ||
        document.querySelector('[contenteditable="true"]') ||
        document.querySelector('textarea') ||
        document.querySelector('input:not([type="hidden"]):not([type="file"])') ||
        document.body;
    }

    if (target) {
      if (typeof target.focus === 'function') target.focus();
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt
      });
      target.dispatchEvent(pasteEvent);
      console.log('[GlanceAI] Universal fallback synthetic paste dispatched on', target.tagName, target.id || target.className || '');
      return true;
    }
  } catch (err) {
    console.warn('[GlanceAI] Universal fallback error:', err);
  }
  return false;
}

// Provider detection engine across Gemini, ChatGPT, Claude, and Perplexity
function detectActiveProvider(urlOrHostname = '', doc = (typeof document !== 'undefined' ? document : null)) {
  const loc = typeof window !== 'undefined' && window.location ? window.location : null;
  const target = (urlOrHostname || (loc ? loc.href : '')).toLowerCase();
  const hostname = (loc ? loc.hostname : '').toLowerCase();

  // 1. Direct domain & mock URL detection
  if (
    target.includes('chatgpt.com') ||
    target.includes('chat.openai.com') ||
    hostname.includes('chatgpt.com') ||
    hostname.includes('openai.com') ||
    target.includes('chatgpt_mock')
  ) {
    return 'chatgpt';
  }
  if (
    target.includes('claude.ai') ||
    hostname.includes('claude.ai') ||
    target.includes('claude_mock')
  ) {
    return 'claude';
  }
  if (
    target.includes('perplexity.ai') ||
    hostname.includes('perplexity.ai') ||
    target.includes('perplexity_mock')
  ) {
    return 'perplexity';
  }
  if (
    target.includes('gemini.google.com') ||
    hostname.includes('gemini.google.com') ||
    target.includes('gemini_mock')
  ) {
    return 'gemini';
  }

  // 2. DOM heuristics & explicit data-provider attribute
  if (doc) {
    const explicit =
      doc.documentElement?.getAttribute('data-provider') ||
      doc.body?.getAttribute('data-provider');
    if (explicit) {
      const p = explicit.toLowerCase().trim();
      if (['gemini', 'chatgpt', 'claude', 'perplexity'].includes(p)) return p;
    }

    // Distinctive provider DOM selectors
    if (
      doc.querySelector('#prompt-textarea') ||
      doc.querySelector('[data-testid="send-button"]') ||
      doc.querySelector('[data-testid="fruitjuice-send-button"]')
    ) {
      return 'chatgpt';
    }
    if (
      doc.querySelector('.ProseMirror') ||
      doc.querySelector('button[aria-label="Send Message"]')
    ) {
      return 'claude';
    }
    if (
      doc.querySelector('textarea[placeholder*="Ask" i]') ||
      doc.querySelector('button[aria-label="Submit"]') ||
      doc.querySelector('[data-testid*="dropzone"]')
    ) {
      return 'perplexity';
    }
    if (
      doc.querySelector('rich-textarea') ||
      doc.querySelector('.ql-editor') ||
      doc.querySelector('[aria-label="Upload & tools"]')
    ) {
      return 'gemini';
    }
  }

  return 'gemini';
}

/**
 * WhisprGPT one-shot monkey-patch on HTMLInputElement.prototype.click.
 * When clicking the hidden local file upload button calls .click() on the <input type="file">,
 * we intercept it, inject the screenshot, and prevent opening the Windows file picker dialog.
 */
function installFileInputClickInterceptor(dataUrl, autoRestoreMs = 3500) {
  const original = HTMLInputElement.prototype.click;
  const state = { intercepted: false };
  HTMLInputElement.prototype.click = function () {
    if (!state.intercepted && this.type === 'file') {
      state.intercepted = true;
      HTMLInputElement.prototype.click = original;
      try {
        injectFileFromDataUrl(this, dataUrl);
        console.log('[GlanceAI] Intercepted file input click; injected screenshot successfully!');
      } catch (e) {
        console.error('[GlanceAI] File injection error:', e);
      }
      return;
    }
    return original.apply(this);
  };
  setTimeout(() => {
    if (!state.intercepted) {
      HTMLInputElement.prototype.click = original;
    }
  }, autoRestoreMs);
  return state;
}

/**
 * Installs the click interceptor inside page's main-world context via webFrame.
 * This guarantees that when page script invokes .click() on the hidden file input,
 * the call hits the main-world interceptor rather than opening the native Windows file dialog.
 */
function installMainWorldClickInterceptor(dataUrl, autoRestoreMs = 3500) {
  try {
    if (typeof webFrame !== 'undefined' && webFrame.executeJavaScript) {
      webFrame.executeJavaScript(`
        (() => {
          if (typeof window.__undec_installClickInterceptor === 'function') {
            window.__undec_installClickInterceptor(${JSON.stringify(dataUrl)}, ${autoRestoreMs});
            return;
          }

          window.__undec_interceptor_state = window.__undec_interceptor_state || { intercepted: false, installed: false };
          window.__undec_interceptor_state.intercepted = false;
          window.__undec_interceptor_state.installed = true;

          const originalClick = HTMLInputElement.prototype.click;

          function injectFile(input, dataUrl, filename) {
            try {
              const parts = dataUrl.split(',');
              const meta = parts[0];
              const b64 = parts[1];
              const mime = (meta.split(':')[1] || 'image/png').split(';')[0];
              const byteString = atob(b64);
              const ab = new ArrayBuffer(byteString.length);
              const ia = new Uint8Array(ab);
              for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
              }
              const file = new File([new Blob([ab], { type: mime })], filename || 'screenshot.png', { type: mime });
              const dt = new DataTransfer();
              dt.items.add(file);
              input.files = dt.files;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (err) {
              console.error('[GlanceAI-MainWorld] Error injecting file:', err);
            }
          }

          HTMLInputElement.prototype.click = function () {
            if (!window.__undec_interceptor_state.intercepted && this.type === 'file') {
              window.__undec_interceptor_state.intercepted = true;
              HTMLInputElement.prototype.click = originalClick;
              window.__undec_interceptor_state.installed = false;
              injectFile(this, ${JSON.stringify(dataUrl)}, 'screenshot.png');
              console.log('[GlanceAI-MainWorld] Intercepted file input click; suppressed native file dialog');
              return;
            }
            return originalClick.apply(this);
          };

          setTimeout(() => {
            if (window.__undec_interceptor_state.installed) {
              HTMLInputElement.prototype.click = originalClick;
              window.__undec_interceptor_state.installed = false;
            }
          }, ${autoRestoreMs});
        })();
      `);
    }
  } catch (err) {
    console.warn('[GlanceAI] installMainWorldClickInterceptor warning:', err);
  }
}

/**
 * Executes 2-step trigger sequence for Gemini or explicit selector strategies:
 * Step 1: Click tool selector (reveals upload options)
 * Step 2: Arm click interceptor and click upload button
 * Fallback: Search existing input[type="file"] and inject directly
 * Ultimate Fallback: Synthetic clipboard paste into editor
 */
async function uploadViaTriggerSequence(strategy, dataUrl) {
  const gapMs = strategy.clickGapMs ?? 400;
  const interceptorAutoRestoreMs = 3500;
  let interceptor = null;

  for (let i = 0; i < strategy.triggerSelectors.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, gapMs));
    const sel = strategy.triggerSelectors[i];
    const el = await waitForElement(sel, strategy.waitTimeoutMs || 1200);
    if (!el) {
      console.warn('[GlanceAI] triggerSequence element not found:', sel);
      continue;
    }

    console.log(`[GlanceAI] triggerSequence step ${i + 1}/${strategy.triggerSelectors.length}:`, sel, el.tagName);

    if (i === strategy.triggerSelectors.length - 1) {
      interceptor = installFileInputClickInterceptor(dataUrl, interceptorAutoRestoreMs);
      installMainWorldClickInterceptor(dataUrl, interceptorAutoRestoreMs);
    }
    el.click();
  }

  await new Promise((r) => setTimeout(r, gapMs));

  let wasIntercepted = !!(interceptor && interceptor.intercepted);
  if (!wasIntercepted) {
    try {
      if (typeof webFrame !== 'undefined' && webFrame.executeJavaScript) {
        wasIntercepted = await webFrame.executeJavaScript(
          '!!(window.__undec_interceptor_state && window.__undec_interceptor_state.intercepted)'
        );
      }
    } catch (_) {}
  }

  if (!wasIntercepted) {
    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    console.log(`[GlanceAI] Checking direct inputs: found ${inputs.length}`);
    if (inputs.length > 0) {
      const lastInput = inputs[inputs.length - 1];
      injectFileFromDataUrl(lastInput, dataUrl);
      console.log('[GlanceAI] Injected screenshot directly into input[type="file"]');
      return true;
    }

    console.log('[GlanceAI] Attempting synthetic paste fallback into editor...');
    const editor =
      document.querySelector('rich-textarea .ql-editor') ||
      document.querySelector('.ql-editor') ||
      document.querySelector('[contenteditable="true"]') ||
      document.querySelector('textarea');
    if (editor) {
      return pasteImageBlob(editor, dataUrl);
    }
  }

  return true;
}

// Injects image into Gemini
async function uploadScreenshotToGemini(arg) {
  const dataUrl = typeof arg === 'string' ? arg : arg?.dataUrl;
  if (!dataUrl) return false;

  console.log('[GlanceAI] Uploading screenshot to Gemini via trigger sequence...');
  const strategy = (typeof arg === 'object' && arg.strategy) ? arg.strategy : {
    type: 'triggerSequence',
    triggerSelectors: [
      '[aria-label="Upload & tools"]',
      '[data-test-id="hidden-local-file-upload-button"]'
    ],
    waitTimeoutMs: 1200,
    clickGapMs: 400
  };

  return await uploadViaTriggerSequence(strategy, dataUrl);
}

// Injects image into ChatGPT
async function uploadScreenshotToChatGPT(arg) {
  const dataUrl = typeof arg === 'string' ? arg : arg?.dataUrl;
  if (!dataUrl) return false;

  console.log('[GlanceAI] Uploading screenshot to ChatGPT...');

  if (arg?.strategy?.type === 'triggerSequence') {
    return await uploadViaTriggerSequence(arg.strategy, dataUrl);
  }

  const preferFileInput = arg?.preferFileInput || arg?.strategy?.type === 'fileInput';
  const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
  const editor =
    document.querySelector('div[contenteditable="true"]#prompt-textarea') ||
    document.querySelector('#prompt-textarea') ||
    document.querySelector('textarea#prompt-textarea') ||
    document.querySelector('form textarea') ||
    document.querySelector('div[contenteditable="true"]') ||
    document.querySelector('textarea');

  const attachBtn =
    document.querySelector('button[data-testid="attach-button"]') ||
    document.querySelector('button[aria-label*="Attach" i]') ||
    document.querySelector('button[aria-label="Attach files"]');

  if (preferFileInput || (!editor && fileInputs.length > 0)) {
    if (attachBtn && fileInputs.length > 0) {
      const interceptor = installFileInputClickInterceptor(dataUrl, 3000);
      installMainWorldClickInterceptor(dataUrl, 3000);
      attachBtn.click();
      if (interceptor.intercepted) {
        console.log('[GlanceAI] Intercepted ChatGPT attach button click');
        return true;
      }
    }
    if (fileInputs.length > 0) {
      injectFileFromDataUrl(fileInputs[fileInputs.length - 1], dataUrl);
      console.log('[GlanceAI] Screenshot injected directly into ChatGPT file input');
      return true;
    }
  }

  // Paste image blob directly into div[contenteditable="true"]#prompt-textarea / textarea
  if (editor) {
    const pasted = pasteImageBlob(editor, dataUrl);
    if (pasted) {
      console.log('[GlanceAI] Screenshot pasted directly into ChatGPT editor');
      return true;
    }
  }

  // Fallback: attach button intercept or direct file input
  if (attachBtn && fileInputs.length > 0) {
    const interceptor = installFileInputClickInterceptor(dataUrl, 3000);
    installMainWorldClickInterceptor(dataUrl, 3000);
    attachBtn.click();
    if (interceptor.intercepted) {
      console.log('[GlanceAI] Intercepted ChatGPT attach button click (fallback)');
      return true;
    }
    injectFileFromDataUrl(fileInputs[fileInputs.length - 1], dataUrl);
    return true;
  }

  if (fileInputs.length > 0) {
    injectFileFromDataUrl(fileInputs[fileInputs.length - 1], dataUrl);
    console.log('[GlanceAI] Screenshot injected directly into ChatGPT file input (fallback)');
    return true;
  }

  return fallbackSyntheticPaste(dataUrl);
}

// Injects image into Claude
async function uploadScreenshotToClaude(arg) {
  const dataUrl = typeof arg === 'string' ? arg : arg?.dataUrl;
  if (!dataUrl) return false;

  console.log('[GlanceAI] Uploading screenshot to Claude...');

  if (arg?.strategy?.type === 'triggerSequence') {
    return await uploadViaTriggerSequence(arg.strategy, dataUrl);
  }

  const preferFileInput = arg?.preferFileInput || arg?.strategy?.type === 'fileInput';
  const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
  const editor =
    document.querySelector('div.ProseMirror[contenteditable="true"]') ||
    document.querySelector('.ProseMirror') ||
    document.querySelector('fieldset div[contenteditable="true"]') ||
    document.querySelector('div[contenteditable="true"]');

  const attachBtn =
    document.querySelector('button[aria-label*="Upload" i]') ||
    document.querySelector('button[aria-label*="Attach" i]') ||
    document.querySelector('button[aria-label*="Add content" i]');

  if (preferFileInput || (!editor && fileInputs.length > 0)) {
    if (attachBtn && fileInputs.length > 0) {
      const interceptor = installFileInputClickInterceptor(dataUrl, 3000);
      installMainWorldClickInterceptor(dataUrl, 3000);
      attachBtn.click();
      if (interceptor.intercepted) return true;
    }
    if (fileInputs.length > 0) {
      injectFileFromDataUrl(fileInputs[fileInputs.length - 1], dataUrl);
      console.log('[GlanceAI] Screenshot injected into Claude file input');
      return true;
    }
  }

  // Paste image DataTransfer into ProseMirror / contenteditable
  if (editor) {
    const pasted = pasteImageBlob(editor, dataUrl);
    if (pasted) {
      console.log('[GlanceAI] Screenshot pasted via DataTransfer into Claude ProseMirror');
      return true;
    }
  }

  // Fallback: attach button intercept or direct file input
  if (attachBtn && fileInputs.length > 0) {
    const interceptor = installFileInputClickInterceptor(dataUrl, 3000);
    installMainWorldClickInterceptor(dataUrl, 3000);
    attachBtn.click();
    if (interceptor.intercepted) return true;
    injectFileFromDataUrl(fileInputs[fileInputs.length - 1], dataUrl);
    return true;
  }

  if (fileInputs.length > 0) {
    injectFileFromDataUrl(fileInputs[fileInputs.length - 1], dataUrl);
    console.log('[GlanceAI] Screenshot attached via Claude input file element');
    return true;
  }

  return fallbackSyntheticPaste(dataUrl);
}

// Injects image into Perplexity
async function uploadScreenshotToPerplexity(arg) {
  const dataUrl = typeof arg === 'string' ? arg : arg?.dataUrl;
  if (!dataUrl) return false;

  console.log('[GlanceAI] Uploading screenshot to Perplexity...');

  if (arg?.strategy?.type === 'triggerSequence') {
    return await uploadViaTriggerSequence(arg.strategy, dataUrl);
  }

  // 1. Inject image into file upload input
  const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
  if (fileInputs.length > 0) {
    injectFileFromDataUrl(fileInputs[fileInputs.length - 1], dataUrl);
    console.log('[GlanceAI] Screenshot injected into Perplexity file input');
    return true;
  }

  // 2. Inject image into file dropzone
  const dropzone =
    document.querySelector('[data-testid*="dropzone" i]') ||
    document.querySelector('.dropzone') ||
    document.querySelector('[class*="dropzone" i]') ||
    document.querySelector('form.relative') ||
    document.querySelector('form');

  if (dropzone) {
    try {
      const file = dataUrlToFile(dataUrl, 'screenshot.png');
      const dt = new DataTransfer();
      dt.items.add(file);
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt
      });
      dropzone.dispatchEvent(dropEvent);
      console.log('[GlanceAI] Screenshot injected into Perplexity dropzone');
      return true;
    } catch (err) {
      console.warn('[GlanceAI] Dropzone dispatch error:', err);
    }
  }

  // 3. Fallback: paste directly into query textarea
  const textarea =
    document.querySelector('textarea[placeholder*="Ask" i]') ||
    document.querySelector('textarea[placeholder*="search" i]') ||
    document.querySelector('textarea') ||
    document.querySelector('[contenteditable="true"]');

  if (textarea) {
    const pasted = pasteImageBlob(textarea, dataUrl);
    if (pasted) {
      console.log('[GlanceAI] Screenshot pasted into Perplexity textarea fallback');
      return true;
    }
  }

  return fallbackSyntheticPaste(dataUrl);
}

// Unified multi-provider upload engine
async function uploadScreenshot(arg) {
  if (typeof arg === 'object' && arg?.strategy?.type === 'triggerSequence') {
    return await uploadViaTriggerSequence(arg.strategy, typeof arg === 'string' ? arg : arg.dataUrl);
  }

  const provider = detectActiveProvider();
  console.log(`[GlanceAI] uploadScreenshot targeting provider: ${provider}`);

  switch (provider) {
    case 'chatgpt':
      return await uploadScreenshotToChatGPT(arg);
    case 'claude':
      return await uploadScreenshotToClaude(arg);
    case 'perplexity':
      return await uploadScreenshotToPerplexity(arg);
    case 'gemini':
    default:
      return await uploadScreenshotToGemini(arg);
  }
}

// Injects prompt into Gemini's Quill / rich-textarea editor
async function injectPromptToGemini(promptText) {
  if (!promptText) return false;
  console.log('[GlanceAI] Injecting prompt text into Gemini editor...');
  const editor =
    (await waitForElement('rich-textarea .ql-editor', 3000)) ||
    document.querySelector('.ql-editor') ||
    document.querySelector('[contenteditable="true"]');

  if (!editor) {
    console.warn('[GlanceAI] Could not find Gemini editor element');
    return false;
  }

  editor.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, promptText);

  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// Injects prompt into ChatGPT contenteditable / textarea
async function injectPromptToChatGPT(promptText) {
  if (!promptText) return false;
  console.log('[GlanceAI] Injecting prompt text into ChatGPT...');

  const editor =
    (await waitForElement('div[contenteditable="true"]#prompt-textarea', 1500)) ||
    document.querySelector('#prompt-textarea') ||
    document.querySelector('textarea#prompt-textarea') ||
    document.querySelector('form textarea') ||
    document.querySelector('div[contenteditable="true"]') ||
    document.querySelector('textarea');

  if (!editor) {
    console.warn('[GlanceAI] Could not find ChatGPT editor');
    return false;
  }

  editor.focus();

  if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      editor.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(editor, promptText);
    } else {
      editor.value = promptText;
    }
  } else {
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, promptText);

    if (!editor.textContent || !editor.textContent.includes(promptText)) {
      let p = editor.querySelector('p');
      if (!p) {
        p = document.createElement('p');
        editor.innerHTML = '';
        editor.appendChild(p);
      }
      p.textContent = promptText;
    }
  }

  try {
    editor.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: promptText
    }));
  } catch (_) {}
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// Injects prompt into Claude ProseMirror / contenteditable container
async function injectPromptToClaude(promptText) {
  if (!promptText) return false;
  console.log('[GlanceAI] Injecting prompt text into Claude...');

  const editor =
    (await waitForElement('div.ProseMirror[contenteditable="true"]', 1500)) ||
    document.querySelector('.ProseMirror') ||
    document.querySelector('fieldset div[contenteditable="true"]') ||
    document.querySelector('div[contenteditable="true"]') ||
    document.querySelector('textarea');

  if (!editor) {
    console.warn('[GlanceAI] Could not find Claude editor');
    return false;
  }

  editor.focus();

  if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
    editor.value = promptText;
  } else {
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, promptText);

    if (!editor.textContent || !editor.textContent.includes(promptText)) {
      let p = editor.querySelector('p');
      if (!p) {
        p = document.createElement('p');
        editor.innerHTML = '';
        editor.appendChild(p);
      }
      p.textContent = promptText;
    }
  }

  try {
    editor.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: promptText
    }));
  } catch (_) {}
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// Injects prompt into Perplexity query textarea
async function injectPromptToPerplexity(promptText) {
  if (!promptText) return false;
  console.log('[GlanceAI] Injecting prompt text into Perplexity...');

  const editor =
    (await waitForElement('textarea[placeholder*="Ask" i]', 1500)) ||
    document.querySelector('textarea[placeholder*="search" i]') ||
    document.querySelector('textarea') ||
    document.querySelector('[contenteditable="true"]');

  if (!editor) {
    console.warn('[GlanceAI] Could not find Perplexity textarea');
    return false;
  }

  editor.focus();
  if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      editor.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(editor, promptText);
    } else {
      editor.value = promptText;
    }
  } else {
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, promptText);
    if (!editor.textContent || !editor.textContent.includes(promptText)) {
      editor.textContent = promptText;
    }
  }

  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// Unified multi-provider prompt injection
async function injectPrompt(promptText) {
  if (!promptText) return false;
  const provider = detectActiveProvider();
  console.log(`[GlanceAI] injectPrompt targeting provider: ${provider}`);

  switch (provider) {
    case 'chatgpt':
      return await injectPromptToChatGPT(promptText);
    case 'claude':
      return await injectPromptToClaude(promptText);
    case 'perplexity':
      return await injectPromptToPerplexity(promptText);
    case 'gemini':
    default:
      return await injectPromptToGemini(promptText);
  }
}

// Submits the query across providers with fallback to synthetic Enter keydown
async function submitPrompt() {
  const provider = detectActiveProvider();
  console.log(`[GlanceAI] Submitting message to ${provider}...`);

  const providerSelectors = {
    chatgpt: [
      'button[data-testid="send-button"]',
      'button[data-testid="fruitjuice-send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send message"]',
      'button[aria-label*="Send" i]'
    ],
    claude: [
      'button[aria-label="Send Message"]',
      'button[aria-label="Send message"]',
      'button[aria-label*="Send" i]',
      'button[data-testid*="send" i]'
    ],
    perplexity: [
      'button[aria-label="Submit"]',
      'button[aria-label*="Submit" i]',
      'button[aria-label="Ask follow-up"]',
      'button[aria-label*="Send" i]',
      'button[data-testid*="submit" i]'
    ],
    gemini: [
      '[aria-label="Send message"]',
      '[aria-label="Send prompt"]',
      'button.send-button',
      'button[aria-label*="Send" i]'
    ]
  };

  const prioritizedSelectors = [
    ...(providerSelectors[provider] || []),
    'button[data-testid="send-button"]',
    'button[aria-label="Send message"]',
    'button[aria-label="Send Message"]',
    'button[aria-label="Submit"]',
    'button[aria-label="Send prompt"]',
    'button.send-button',
    'button[aria-label*="Send" i]',
    'button[aria-label*="Submit" i]'
  ];

  for (let attempt = 0; attempt < 8; attempt++) {
    for (const sel of prioritizedSelectors) {
      const btn = document.querySelector(sel);
      if (btn && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true' && !btn.disabled) {
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        btn.dispatchEvent(clickEvent);
        console.log('[GlanceAI] Clicked submit button:', sel);
        return true;
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  // Fallback: enter key on editor
  console.log('[GlanceAI] Send button not ready or enabled; attempting Enter keydown fallback...');
  const editorCandidates = [
    document.activeElement,
    document.querySelector('div[contenteditable="true"]#prompt-textarea'),
    document.querySelector('div.ProseMirror[contenteditable="true"]'),
    document.querySelector('rich-textarea .ql-editor'),
    document.querySelector('.ql-editor'),
    document.querySelector('textarea'),
    document.querySelector('[contenteditable="true"]')
  ];

  for (const ed of editorCandidates) {
    if (ed && ed !== document.body && ed !== document.documentElement) {
      if (typeof ed.focus === 'function') ed.focus();
      ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      ed.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      ed.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      console.log('[GlanceAI] Dispatched synthetic Enter fallback on', ed.tagName, ed.id || ed.className || '');
      return true;
    }
  }

  console.warn('[GlanceAI] Submit button and editor fallback could not be triggered');
  return false;
}

const submitGemini = submitPrompt;

// Expose upload API matching WhisprGPT & Glance AI multi-provider
contextBridge.exposeInMainWorld('upload', {
  uploadImage: (args) => uploadScreenshot(args),
  waitForElement: (selector, timeoutMs) => waitForElement(selector, timeoutMs),
  uploadPrompt: (promptText) => injectPrompt(promptText),
  submitPrompt: () => submitPrompt(),
  detectProvider: (urlOrHostname) => detectActiveProvider(urlOrHostname),
  uploadScreenshotToGemini: (args) => uploadScreenshotToGemini(args),
  uploadScreenshotToChatGPT: (args) => uploadScreenshotToChatGPT(args),
  uploadScreenshotToClaude: (args) => uploadScreenshotToClaude(args),
  uploadScreenshotToPerplexity: (args) => uploadScreenshotToPerplexity(args),
  injectPromptToGemini: (promptText) => injectPromptToGemini(promptText),
  injectPromptToChatGPT: (promptText) => injectPromptToChatGPT(promptText),
  injectPromptToClaude: (promptText) => injectPromptToClaude(promptText),
  injectPromptToPerplexity: (promptText) => injectPromptToPerplexity(promptText),
  fallbackSyntheticPaste: (dataUrl) => fallbackSyntheticPaste(dataUrl)
});

// Scrolls chat history across providers
function scrollChat(amount) {
  const scrollSelectors = [
    'infinite-scroller.chat-history',
    '.chat-history',
    'main',
    '.conversation-container',
    '[class*="scroller"]',
    '[data-testid*="conversation"]',
    'div[class*="overflow-y-auto"]'
  ];

  for (const sel of scrollSelectors) {
    const el = document.querySelector(sel);
    if (el && el.scrollHeight > el.clientHeight) {
      el.scrollBy({ top: amount, behavior: 'smooth' });
      return;
    }
  }
  window.scrollBy({ top: amount, behavior: 'smooth' });
}
const scrollGeminiChat = scrollChat;

// Floating Toast Notification
function showToast(text, durationMs = 2600) {
  let toast = document.getElementById('undec-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'undec-toast';
    toast.style.cssText = `
      position: fixed;
      top: 42px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(24, 24, 27, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #f4f4f5;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 11px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 999999999;
      pointer-events: none;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      transition: opacity 0.2s ease;
      opacity: 0;
    `;
    document.body.appendChild(toast);
  }

  toast.textContent = text;
  toast.style.opacity = '1';

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
  }, durationMs);
}

// Handle actions coming from main process global shortcuts

// 1. Screenshot & Attach (Ctrl + S)
ipcRenderer.on('action:attach-screenshot', async (_event, { dataUrl, prompt, autoSubmit }) => {
  const provider = detectActiveProvider();
  const providerTitles = {
    gemini: 'Gemini',
    chatgpt: 'ChatGPT',
    claude: 'Claude',
    perplexity: 'Perplexity'
  };
  const providerName = providerTitles[provider] || 'Assistant';

  showToast(`📸 Attaching screenshot to ${providerName}...`);
  if (dataUrl) {
    await uploadScreenshot(dataUrl);
    await new Promise((r) => setTimeout(r, 200));
  }

  if (prompt) {
    await injectPrompt(prompt);
  }

  if (autoSubmit) {
    showToast(`🚀 Auto-submitting to ${providerName}...`);
    await new Promise((r) => setTimeout(r, 400));
    const success = await submitPrompt();
    if (success) {
      showToast(`✅ Sent to ${providerName}!`);
    }
  } else {
    showToast('✅ Attached! Press Ctrl+Enter to send.');
  }
});

// 2. Submit Message (Ctrl + Enter)
ipcRenderer.on('action:submit', async () => {
  showToast('🚀 Sending...');
  const success = await submitPrompt();
  if (success) {
    showToast('✅ Sent successfully!');
  } else {
    showToast('⚠️ Send button not ready yet');
  }
});

// 2b. Toggle Dashboard / Gemini (Ctrl + B)
ipcRenderer.on('action:toggle-dashboard', () => {
  ipcRenderer.invoke('open-dashboard');
});

// 3. Scroll Chat
ipcRenderer.on('action:scroll', (_event, amount) => {
  scrollChat(amount);
});

// 4. Focusable Changed (Ctrl + F)
ipcRenderer.on('action:focus-changed', (_event, isFocusable) => {
  updateFocusButton(isFocusable);
  showToast(
    isFocusable
      ? '🎯 Focus: ON (typing enabled)'
      : '🔒 Focus: OFF (stealth clicks won\'t unfocus other apps)'
  );
});

// 5. Click-Through Changed (Ctrl + M)
ipcRenderer.on('action:click-through-changed', (_event, isClickThrough) => {
  isClickThroughActive = !!isClickThrough;
  updateClickThroughButton(isClickThroughActive);
  showToast(
    isClickThroughActive
      ? '👻 Click-Through: ON (clicks pass through to apps underneath)'
      : '🖱️ Click-Through: OFF (normal interaction)'
  );
});

// 6. Opacity Changed (Ctrl + [ / Ctrl + ])
ipcRenderer.on('action:opacity-changed', (_event, val) => {
  const slider = document.getElementById('undec-opacity-slider');
  if (slider && Number.isFinite(val)) {
    slider.value = val;
  }
});

// 7. Show Toast Notification
ipcRenderer.on('action:show-toast', (_event, payload) => {
  const text = typeof payload === 'string' ? payload : payload?.message;
  const duration = typeof payload === 'object' && payload?.durationMs ? payload.durationMs : 2600;
  if (text) showToast(text, duration);
});

// Once DOM is ready, inject our custom stealth floating top bar (strictly on supported AI overlays, never Dashboard or Google Accounts auth)
function safeInjectHeader() {
  if (typeof window === 'undefined' || !window.location) return;
  const href = window.location.href || '';
  const hostname = window.location.hostname || '';

  // Do not inject on local dashboard or Google accounts authentication
  if (href.includes('dashboard.html') || hostname.includes('accounts.google.com')) {
    return;
  }

  // Only inject toolbar on supported AI providers or local test mock
  const isSupportedApp =
    hostname.includes('gemini.google.com') ||
    hostname.includes('chatgpt.com') ||
    hostname.includes('openai.com') ||
    hostname.includes('claude.ai') ||
    hostname.includes('perplexity.ai') ||
    href.includes('_mock.html');

  if (!isSupportedApp) {
    return;
  }

  if (document.getElementById('undecgpt-toolbar')) return;
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', () => injectStealthHeader(), { once: true });
    return;
  }
  injectStealthHeader();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', safeInjectHeader, { once: true });
} else {
  safeInjectHeader();
}

function updateFocusButton(isFocusable) {
  const btn = document.getElementById('undec-focus-btn');
  if (!btn) return;
  if (isFocusable) {
    btn.textContent = 'Focus: ON';
    btn.classList.add('active');
    btn.title = 'Focus Mode active: clicking will activate overlay & allow typing (Ctrl+F to toggle)';
  } else {
    btn.textContent = 'Focus: OFF';
    btn.classList.remove('active');
    btn.title = 'Focus Mode non-intrusive: clicking will NOT unfocus other apps (Ctrl+F to toggle)';
  }
}

function updateClickThroughButton(isClickThrough) {
  const btn = document.getElementById('undec-clickthru-btn');
  if (!btn) return;
  if (isClickThrough) {
    btn.textContent = 'Click-Through: ON';
    btn.classList.add('active');
    btn.title = 'Click-through active: clicks pass through overlay to underlying apps. Hover toolbar or press Ctrl+M to toggle.';
  } else {
    btn.textContent = 'Click-Through: OFF';
    btn.classList.remove('active');
    btn.title = 'Click-through inactive: normal interaction with overlay (Ctrl+M to toggle)';
  }
}

function injectStealthHeader() {
  if (document.getElementById('undecgpt-toolbar')) return;

  const style = document.createElement('style');
  style.id = 'undecgpt-styles';
  style.textContent = `
    #undecgpt-toolbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 34px;
      background: rgba(18, 18, 22, 0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      z-index: 99999999;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 10px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px;
      color: #e2e8f0;
      user-select: none;
      -webkit-app-region: drag;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
    }
    #undecgpt-toolbar .brand {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      color: #60a5fa;
      letter-spacing: 0.5px;
    }
    #undecgpt-toolbar .brand svg {
      width: 14px;
      height: 14px;
      fill: #60a5fa;
    }
    #undecgpt-toolbar .controls {
      display: flex;
      align-items: center;
      gap: 5px;
      -webkit-app-region: no-drag;
    }
    .undec-btn {
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      padding: 3px 7px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
    }
    .undec-btn:hover {
      background: rgba(255, 255, 255, 0.16);
      color: #fff;
    }
    .undec-btn.active {
      background: #2563eb;
      border-color: #3b82f6;
      color: #fff;
    }
    .undec-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 500;
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.25);
    }
    .undec-slider-wrap {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #94a3b8;
      font-size: 10px;
    }
    .undec-slider {
      width: 48px;
      height: 4px;
      accent-color: #3b82f6;
      cursor: pointer;
    }
    body {
      padding-top: 34px !important;
      box-sizing: border-box !important;
    }
  `;
  document.head.appendChild(style);

  const toolbar = document.createElement('div');
  toolbar.id = 'undecgpt-toolbar';
  toolbar.innerHTML = `
    <div class="brand">
      <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      <span>Glance AI</span>
      <span class="undec-badge" title="Always-on-top workspace companion">HUD</span>
    </div>
    <div class="controls">
      <button id="undec-clickthru-btn" class="undec-btn" title="Toggle Click-Through Mode (Ctrl+M)">
        Click-Through: OFF
      </button>
      <button id="undec-focus-btn" class="undec-btn active" title="Toggle Focus Mode (Ctrl+F)">
        Focus: ON
      </button>
      <button id="undec-snap-btn" class="undec-btn" title="Capture Workspace (Ctrl+S)">
        Capture
      </button>
      <button id="undec-send-btn" class="undec-btn" title="Send Message (Ctrl+Enter)">
        Send
      </button>
      <div class="undec-slider-wrap" title="Adjust Window Opacity (Ctrl+[ or Ctrl+])">
        <span>Opacity</span>
        <input type="range" id="undec-opacity-slider" class="undec-slider" min="0.15" max="1.0" step="0.05" value="0.95">
      </div>
      <button id="undec-menu-btn" class="undec-btn" title="Dashboard Menu (Ctrl+B)">Menu</button>
      <button id="undec-settings-btn" class="undec-btn" title="Settings & Prompt">Config</button>
      <button id="undec-hide-btn" class="undec-btn" title="Hide Overlay (Ctrl+H)">Hide</button>
      <button id="undec-close-btn" class="undec-btn" title="Close App (Ctrl+Shift+Q)">✕</button>
    </div>
  `;

  document.body.prepend(toolbar);

  // Bind toolbar event listeners
  const clickthruBtn = toolbar.querySelector('#undec-clickthru-btn');
  const focusBtn = toolbar.querySelector('#undec-focus-btn');
  const snapBtn = toolbar.querySelector('#undec-snap-btn');
  const sendBtn = toolbar.querySelector('#undec-send-btn');
  const opacitySlider = toolbar.querySelector('#undec-opacity-slider');
  const settingsBtn = toolbar.querySelector('#undec-settings-btn');
  const hideBtn = toolbar.querySelector('#undec-hide-btn');
  const closeBtn = toolbar.querySelector('#undec-close-btn');

  let isToolbarHovered = false;

  // Automatic hover detection: when mouse is over toolbar, allow clicks on toolbar!
  toolbar.addEventListener('mouseenter', () => {
    isToolbarHovered = true;
    ipcRenderer.invoke('set-ignore-mouse-events', false);
  });

  toolbar.addEventListener('mouseleave', async () => {
    isToolbarHovered = false;
    if (document.getElementById('undec-modal-overlay')) {
      return;
    }

    const isCt = await ipcRenderer.invoke('get-click-through');
    isClickThroughActive = !!isCt;

    if (!isToolbarHovered && isClickThroughActive && !document.getElementById('undec-modal-overlay')) {
      ipcRenderer.invoke('set-ignore-mouse-events', true, { forward: true });
    }
  });

  // Query initial states
  ipcRenderer.invoke('get-focusable').then((isFocusable) => {
    updateFocusButton(isFocusable);
  });

  ipcRenderer.invoke('get-click-through').then((isClickThrough) => {
    isClickThroughActive = !!isClickThrough;
    updateClickThroughButton(isClickThroughActive);
  });

  // Initialize opacity slider to stored user setting
  ipcRenderer.invoke('get-settings').then((settings) => {
    if (settings && Number.isFinite(settings.opacity)) {
      opacitySlider.value = settings.opacity;
    }
  });

  // Click-Through Toggle
  clickthruBtn.addEventListener('click', async () => {
    const next = !isClickThroughActive;
    isClickThroughActive = next;
    await ipcRenderer.invoke('set-click-through', next);
    updateClickThroughButton(next);
    showToast(
      next
        ? 'Click-Through: ON (clicks pass through to apps underneath)'
        : 'Click-Through: OFF (normal interaction)'
    );
  });

  // Focus Toggle
  focusBtn.addEventListener('click', async () => {
    const current = await ipcRenderer.invoke('get-focusable');
    const next = !current;
    await ipcRenderer.invoke('set-focusable', next);
    updateFocusButton(next);
    showToast(
      next
        ? 'Focus: ON (typing enabled)'
        : 'Focus: OFF (clicks will not unfocus other apps)'
    );
  });

  // Attach Screen Button
  snapBtn.addEventListener('click', async () => {
    snapBtn.disabled = true;
    snapBtn.textContent = 'Attaching...';
    try {
      const dataUrl = await ipcRenderer.invoke('take-screenshot');
      const settings = await ipcRenderer.invoke('get-settings');
      if (dataUrl) {
        await uploadScreenshot(dataUrl);
        await new Promise((r) => setTimeout(r, 500));
        await injectPrompt(settings.prompt);
        showToast('Attached! Press Ctrl+Enter to send.');
      }
    } finally {
      snapBtn.disabled = false;
      snapBtn.textContent = 'Capture';
    }
  });

  // Send Button
  sendBtn.addEventListener('click', async () => {
    showToast('Sending...');
    const success = await submitPrompt();
    if (success) {
      showToast('Sent successfully!');
    }
  });

  opacitySlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    ipcRenderer.invoke('set-opacity', val);
  });

  hideBtn.addEventListener('click', () => {
    ipcRenderer.invoke('hide-window');
  });

  closeBtn.addEventListener('click', () => {
    ipcRenderer.invoke('close-app');
  });

  const menuBtn = toolbar.querySelector('#undec-menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      ipcRenderer.invoke('open-dashboard');
    });
  }

  settingsBtn.addEventListener('click', () => {
    openSettingsModal();
  });
}

// Injected lightweight settings modal directly into page
function openSettingsModal() {
  const existing = document.getElementById('undec-modal-overlay');
  if (existing) {
    existing.remove();
    return;
  }

  ipcRenderer.invoke('set-ignore-mouse-events', false);

  ipcRenderer.invoke('get-settings').then((settings) => {
    const modalWrap = document.createElement('div');
    modalWrap.id = 'undec-modal-overlay';
    modalWrap.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(4px);
      z-index: 999999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    modalWrap.innerHTML = `
      <div style="
        background: #18181b;
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 10px;
        width: 400px;
        padding: 20px;
        color: #f4f4f5;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      ">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h3 style="margin:0; font-size:15px; color:#60a5fa; font-weight:600;">Glance AI Settings</h3>
          <button id="modal-close" style="background:none; border:none; color:#a1a1aa; cursor:pointer; font-size:16px;">✕</button>
        </div>
        
        <label style="display:block; font-size:12px; font-weight:500; margin-bottom:6px; color:#d4d4d8;">
          Default Assistant Prompt:
        </label>
        <textarea id="modal-prompt" rows="3" style="
          width: 100%;
          background: #27272a;
          border: 1px solid #3f3f46;
          border-radius: 6px;
          color: #fafafa;
          padding: 8px;
          font-size: 12px;
          resize: vertical;
          box-sizing: border-box;
          margin-bottom: 12px;
        ">${settings.prompt || ''}</textarea>

        <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; margin-bottom:10px; cursor:pointer;">
          <input type="checkbox" id="modal-focusable" ${settings.focusable !== false ? 'checked' : ''} style="accent-color:#3b82f6; margin-top:2px;">
          <span>
            <strong>Focus Mode</strong><br>
            <span style="color:#a1a1aa; font-size:11px;">
              When unchecked, clicking on Glance AI will NOT steal focus from other apps you are using.
            </span>
          </span>
        </label>

        <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; margin-bottom:14px; cursor:pointer;">
          <input type="checkbox" id="modal-clickthru" ${settings.clickThrough ? 'checked' : ''} style="accent-color:#3b82f6; margin-top:2px;">
          <span>
            <strong>Click-Through Mode</strong><br>
            <span style="color:#a1a1aa; font-size:11px;">
              Pass all clicks directly through overlay to whatever application is underneath.
            </span>
          </span>
        </label>

        <div style="font-size:11px; color:#a1a1aa; margin-bottom:16px; line-height:1.6; background:rgba(255,255,255,0.04); padding:8px 10px; border-radius:6px;">
          <div><strong>Ctrl + S</strong>: Screenshot & Attach to Active AI</div>
          <div><strong>Ctrl + Enter</strong>: Send Prompt to Active AI</div>
          <div><strong>Ctrl + M</strong>: Toggle Click-Through Mode</div>
          <div><strong>Ctrl + F</strong>: Toggle Focus / No-Activate Mode</div>
          <div><strong>Ctrl + H</strong>: Hide / Show Window (Boss Key)</div>
          <div><strong>Ctrl + Arrows</strong>: Move Window Silently</div>
          <div><strong>Ctrl + Shift + Arrows</strong>: Scroll Chat History</div>
          <div><strong>Ctrl + [ / ]</strong>: Adjust Opacity</div>
          <div><strong>Ctrl + Shift + Q</strong>: Emergency Exit</div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button id="modal-save" style="
            background: #2563eb;
            color: #fff;
            border: none;
            padding: 6px 14px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
          ">Save Settings</button>
        </div>
      </div>
    `;

    document.body.appendChild(modalWrap);

    modalWrap.addEventListener('mouseenter', () => {
      ipcRenderer.invoke('set-ignore-mouse-events', false);
    });

    const closeModal = () => {
      modalWrap.remove();
      if (isClickThroughActive) {
        ipcRenderer.invoke('set-ignore-mouse-events', true, { forward: true });
      }
    };

    modalWrap.querySelector('#modal-close').onclick = closeModal;
    modalWrap.onclick = (e) => {
      if (e.target === modalWrap) closeModal();
    };

    modalWrap.querySelector('#modal-save').onclick = async () => {
      const prompt = modalWrap.querySelector('#modal-prompt').value.trim();
      const focusable = modalWrap.querySelector('#modal-focusable').checked;
      const clickThrough = modalWrap.querySelector('#modal-clickthru').checked;
      isClickThroughActive = clickThrough;
      await ipcRenderer.invoke('save-settings', { prompt, focusable, clickThrough });
      await ipcRenderer.invoke('set-focusable', focusable);
      await ipcRenderer.invoke('set-click-through', clickThrough);
      updateFocusButton(focusable);
      updateClickThroughButton(clickThrough);
      closeModal();
    };
  });
}
