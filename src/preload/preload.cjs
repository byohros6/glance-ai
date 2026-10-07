const { contextBridge, ipcRenderer, webFrame } = require('electron');

const testMode = process.argv.includes('--glance-test-api') && location.protocol === 'file:' && /_mock\.html$/.test(location.pathname);
const isDashboard = location.protocol === 'file:' && location.pathname.replaceAll('\\', '/').endsWith('/renderer/dashboard.html');
function trustedControls(root) {
  for (const type of ['click', 'input', 'change', 'mouseenter', 'mouseleave', 'keydown']) {
    root.addEventListener(type, event => {
      if (!event.isTrusted && !testMode) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
  }
}
// The local dashboard is the only page with an application bridge.
const glanceApi = {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  setOpacity: (val) => ipcRenderer.invoke('set-opacity', val),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  closeApp: () => ipcRenderer.invoke('close-app'),
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
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getShortcutStatus: () => ipcRenderer.invoke('get-shortcut-status'),
  onShortcutStatus: (callback) => { ipcRenderer.on('action:shortcut-status', (_event, value) => callback(value)); },
  onToast: (callback) => { ipcRenderer.on('action:show-toast', (_event, value) => callback(value.message || value)); },
  onLaunchRequest: (callback) => { ipcRenderer.on('action:launch-request', () => callback()); },
  onSettingsChanged: (callback) => { ipcRenderer.on('action:settings-changed', (_event, settings) => callback(settings)); },
  onShortcutAction: (callback) => {
    ipcRenderer.on('shortcut-action', (_event, action, payload) => callback(action, payload));
  }
};

if (isDashboard || testMode) {
  contextBridge.exposeInMainWorld('glanceai', glanceApi);
}

// Synchronous click-through tracking to eliminate async IPC race conditions
let isClickThroughActive = false;
let isToolbarHovered = false;

// Helper: wait for element
function waitForElement(selector, timeoutMs = 4000) {
  const el = document.querySelector(selector);
  if (el) return Promise.resolve(el);

  return new Promise((resolve) => {
    let timer;
    const observer = new MutationObserver(() => {
      const match = document.querySelector(selector);
      if (match) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(match);
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

let screenshotSeq = 0;
function generateScreenshotFilename() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  screenshotSeq = (screenshotSeq + 1) % 10000;
  return `screenshot_${time}_${screenshotSeq}.png`;
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
  try { input.value = ''; } catch {}
  const file = dataUrlToFile(dataUrl, filename);
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// Provider adapters report observed outcomes, never event-dispatch return values.
function detectActiveProvider(value = '', doc = document) {
  const target = value || location.href;
  try {
    const url = new URL(target.includes('://') ? target : `https://${target}`);
    const hosts = { 'gemini.google.com': 'gemini', 'chatgpt.com': 'chatgpt', 'chat.openai.com': 'chatgpt', 'claude.ai': 'claude', 'perplexity.ai': 'perplexity', 'www.perplexity.ai': 'perplexity' };
    if (hosts[url.hostname]) return hosts[url.hostname];
    if (testMode && url.protocol === 'file:') {
      const match = url.pathname.match(/(gemini|chatgpt|claude|perplexity)_mock\.html$/);
      if (match) return match[1];
    }
  } catch {}
  const explicit = doc.documentElement?.getAttribute('data-provider') || doc.body?.getAttribute('data-provider');
  if (['gemini', 'chatgpt', 'claude', 'perplexity'].includes(explicit)) return explicit;
  if (doc.querySelector('#prompt-textarea')) return 'chatgpt';
  if (doc.querySelector('.ProseMirror')) return 'claude';
  if (doc.querySelector('textarea[placeholder*="Ask" i]')) return 'perplexity';
  return 'gemini';
}
const providerAdapters = {
  gemini: {
    editor: 'rich-textarea .ql-editor, .ql-editor, [contenteditable="true"]',
    send: '[aria-label="Send message"], [aria-label="Send prompt"], button.send-button',
    attachments: 'file-preview, .file-preview, [data-test-id*="attachment"], [data-testid*="attachment"], [data-test-id*="file"], [data-testid*="file"], [data-test-id*="uploader"], [data-testid*="uploader"], uploader-file-card, file-card, [class*="file-card" i], [class*="uploader-card" i], [class*="attachment" i], [aria-label*="Remove" i], [aria-label*="Delete" i], [aria-label*="Dismiss" i]'
  },
  chatgpt: {
    editor: '#prompt-textarea, form textarea, [contenteditable="true"]',
    send: 'button[data-testid="send-button"], button[data-testid="fruitjuice-send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"]',
    attachments: '[data-testid*="attachment"], [data-testid*="file-preview"], [aria-label*="Remove" i], [aria-label*="Delete" i]'
  },
  claude: {
    editor: '.ProseMirror, fieldset [contenteditable="true"], textarea',
    send: 'button[aria-label="Send Message"], button[aria-label="Send message"], button[data-testid*="send"]',
    attachments: '[data-testid*="attachment"], [data-testid*="file-thumbnail"], [aria-label*="Remove" i], [aria-label*="Delete" i]'
  },
  perplexity: {
    editor: 'textarea, [contenteditable="true"]',
    send: 'button[aria-label="Submit"], button[aria-label="Ask follow-up"], button[data-testid*="submit"]',
    attachments: '[data-testid*="attachment"], [data-testid*="file-preview"], [aria-label*="Remove" i], [aria-label*="Delete" i]'
  }
};
let rendererOperation = null;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const cancelled = () => !!rendererOperation?.cancelled;
function visible(element) { return !!element && !element.hidden && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden'; }
function editorFor(provider = detectActiveProvider()) {
  return [...document.querySelectorAll(providerAdapters[provider].editor)].find(visible) || null;
}
function inputContainerFor(provider = detectActiveProvider()) {
  const editor = editorFor(provider);
  if (!editor) return document.body;
  return editor.closest('form, .input-area, .text-input-field, fieldset, input-container, [class*="input" i], [class*="prompt" i]') || editor.parentElement?.parentElement || editor.parentElement || document.body;
}
function editorText(editor) { return (editor?.value ?? editor?.innerText ?? editor?.textContent ?? '').trim(); }
function attachmentNodes(provider) {
  const container = inputContainerFor(provider);
  const selector = providerAdapters[provider].attachments;
  const nodes = [...document.querySelectorAll(selector)];
  const containerImages = [...container.querySelectorAll('img')].filter(img => {
    const src = img.src || '';
    return src.startsWith('blob:') || src.startsWith('data:') || src.includes('googleusercontent') || /preview|thumb|card/i.test(img.className || '');
  });
  return [...new Set([...nodes, ...containerImages])].filter(visible);
}
function attachmentSnapshot(provider) { return new Map(attachmentNodes(provider).map(node => [node, node.outerHTML])); }
function uploadPending(provider) {
  const container = inputContainerFor(provider);
  return [...container.querySelectorAll('[role="progressbar"], [aria-busy="true"], [data-testid*="uploading"], [data-test-id*="uploading"], mat-progress-bar')].some(visible);
}
async function waitForOutcome(predicate, timeout = testMode ? 1200 : 12000) {
  const deadline = Date.now() + timeout;
  do {
    if (cancelled()) return false;
    if (predicate()) return true;
    await delay(100);
  } while (Date.now() < deadline);
  return false;
}
function activeErrorTexts(provider) {
  const selectors = [
    '[role="alert"]',
    '[role="status"]',
    'mat-snack-bar-container',
    'snack-bar-container',
    '.toast',
    '[data-testid*="error"]',
    '[data-test-id*="error"]'
  ];
  const candidates = [...document.querySelectorAll(selectors.join(', '))].filter(visible);
  const set = new Set();
  for (const el of candidates) {
    const text = (el.innerText || el.textContent || '').trim();
    if (text) set.add(text);
  }
  return set;
}

function getNewProviderError(provider, existingErrors = new Set()) {
  const currentErrors = activeErrorTexts(provider);
  for (const text of currentErrors) {
    if (!existingErrors.has(text) && /already uploaded|unsupported|failed to upload|could not upload|too large|file type not supported|file named/i.test(text)) {
      return text;
    }
  }
  return null;
}

async function verifyAttachment(provider, before, existingErrors = new Set()) {
  let readySince = 0;
  return waitForOutcome(() => {
    const errorMsg = getNewProviderError(provider, existingErrors);
    if (errorMsg) throw new Error(errorMsg);
    const changed = attachmentNodes(provider).some(node => !before.has(node) || before.get(node) !== node.outerHTML);
    if (!changed || uploadPending(provider)) { readySince = 0; return false; }
    readySince ||= Date.now();
    return Date.now() - readySince >= 200;
  });
}
function pasteImageBlob(target, dataUrl, filename = 'screenshot.png') {
  if (!target) return false;
  const transfer = new DataTransfer(); transfer.items.add(dataUrlToFile(dataUrl, filename));
  target.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }));
  return true; // Attempted, not acknowledged. The caller must verify the preview.
}
async function fallbackSyntheticPaste(dataUrl, filename) {
  const provider = detectActiveProvider();
  const before = attachmentSnapshot(provider);
  const errorsBefore = activeErrorTexts(provider);
  const focused = document.activeElement;
  const target = focused?.matches('textarea, [contenteditable="true"]') ? focused : editorFor(provider);
  return pasteImageBlob(target, dataUrl, filename) ? verifyAttachment(provider, before, errorsBefore) : false;
}
// The interceptor is installed before the page's upload button is activated and restored on every path.
async function installMainWorldClickInterceptor(dataUrl, filename = 'screenshot.png') {
  const token = `glance-${Date.now()}-${Math.random()}`;
  await webFrame.executeJavaScript(`(() => {
    const original = HTMLInputElement.prototype.click;
    const state = { intercepted: false, installed: true, token: ${JSON.stringify(token)} };
    window.__glance_interceptor_state = state;
    const dataUrlToFile = ${dataUrlToFile.toString()};
    const injectFileFromDataUrl = ${injectFileFromDataUrl.toString()};
    const patched = function(...args) {
      if (this.type !== 'file') return original.apply(this, args);
      state.intercepted = injectFileFromDataUrl(this, ${JSON.stringify(dataUrl)}, ${JSON.stringify(filename)});
      restore();
    };
    function restore() {
      if (HTMLInputElement.prototype.click === patched) HTMLInputElement.prototype.click = original;
      state.installed = false;
    }
    state.restore = restore;
    HTMLInputElement.prototype.click = patched;
    setTimeout(restore, 3500);
  })()`);
  return async () => { await webFrame.executeJavaScript(`if (window.__glance_interceptor_state?.token === ${JSON.stringify(token)}) window.__glance_interceptor_state.restore();`).catch(() => {}); };
}
async function uploadViaTriggerSequence(strategy, dataUrl, filename) {
  const provider = detectActiveProvider();
  const before = attachmentSnapshot(provider);
  const errorsBefore = activeErrorTexts(provider);
  const selectors = strategy.triggerSelectors || [];
  let attempted = false;
  for (let index = 0; index < selectors.length; index++) {
    if (cancelled()) return false;
    const element = await waitForElement(selectors[index], strategy.waitTimeoutMs ?? 1200);
    if (!element) continue;
    if (index === selectors.length - 1) {
      if (element.matches('input[type="file"]')) { injectFileFromDataUrl(element, dataUrl, filename); attempted = true; }
      else {
        const restore = await installMainWorldClickInterceptor(dataUrl, filename);
        try {
          element.click();
          await delay(strategy.clickGapMs ?? 400);
          attempted = await webFrame.executeJavaScript('!!window.__glance_interceptor_state?.intercepted');
        } finally { await restore(); }
      }
    } else { element.click(); await delay(strategy.clickGapMs ?? 400); }
  }
  if (!attempted) {
    const input = [...document.querySelectorAll('input[type="file"]')].find(node => !node.disabled && (!node.accept || /image|png|\*/i.test(node.accept)));
    if (input) { injectFileFromDataUrl(input, dataUrl, filename); attempted = true; }
    else attempted = pasteImageBlob(editorFor(provider), dataUrl, filename);
  }
  return attempted ? verifyAttachment(provider, before, errorsBefore) : false;
}
async function uploadForProvider(provider, arg) {
  const dataUrl = typeof arg === 'string' ? arg : arg?.dataUrl;
  const filename = (typeof arg === 'object' && arg?.filename)
    ? arg.filename
    : (testMode ? 'screenshot.png' : generateScreenshotFilename());
  if (!dataUrl || cancelled()) return false;
  if (arg?.strategy?.type === 'triggerSequence') return uploadViaTriggerSequence(arg.strategy, dataUrl, filename);
  const before = attachmentSnapshot(provider);
  const errorsBefore = activeErrorTexts(provider);
  const input = [...document.querySelectorAll('input[type="file"]')].find(node => !node.disabled && (!node.accept || /image|png|\*/i.test(node.accept)));
  const editor = editorFor(provider);
  const preferFile = arg?.preferFileInput || arg?.strategy?.type === 'fileInput' || provider === 'gemini' || provider === 'perplexity';
  if (input && (preferFile || !editor)) {
    injectFileFromDataUrl(input, dataUrl, filename);
    return verifyAttachment(provider, before, errorsBefore);
  }
  if (provider === 'perplexity') {
    const dropzone = document.querySelector('[data-testid*="dropzone"], [role="presentation"][tabindex]');
    if (dropzone) {
      const transfer = new DataTransfer(); transfer.items.add(dataUrlToFile(dataUrl, filename));
      for (const type of ['dragenter', 'dragover', 'drop']) dropzone.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
      return verifyAttachment(provider, before, errorsBefore);
    }
  }
  if (editor) {
    pasteImageBlob(editor, dataUrl, filename);
    // No automatic second delivery after an ambiguous paste: it may still be uploading.
    return verifyAttachment(provider, before, errorsBefore);
  }
  if (input) { injectFileFromDataUrl(input, dataUrl, filename); return verifyAttachment(provider, before, errorsBefore); }
  if (provider === 'gemini') return uploadViaTriggerSequence({ triggerSelectors: ['[aria-label="Upload & tools"]', '[data-test-id="hidden-local-file-upload-button"]'] }, dataUrl, filename);
  return false;
}
const uploadScreenshotToGemini = arg => uploadForProvider('gemini', arg);
const uploadScreenshotToChatGPT = arg => uploadForProvider('chatgpt', arg);
const uploadScreenshotToClaude = arg => uploadForProvider('claude', arg);
const uploadScreenshotToPerplexity = arg => uploadForProvider('perplexity', arg);
const uploadScreenshot = arg => uploadForProvider(detectActiveProvider(), arg);


// Keep an existing draft and let the provider's editor process a real input update.
async function injectPromptFor(provider, prompt) {
  if (!prompt || cancelled()) return false;
  let editor = editorFor(provider);
  if (!editor) { await waitForElement(providerAdapters[provider].editor, 3000); editor = editorFor(provider); }
  if (!editor || cancelled()) return false;
  const existing = editorText(editor);
  const desired = existing.endsWith(prompt) ? existing : (existing ? existing + '\n\n' + prompt : prompt);
  editor.focus();
  if (editor.matches('textarea, input')) {
    const prototype = editor.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(editor, desired);
  } else {
    const selection = window.getSelection();
    const range = document.createRange(); range.selectNodeContents(editor);
    selection.removeAllRanges(); selection.addRange(range);
    if (!document.execCommand('insertText', false, desired)) return false;
  }
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: desired }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));
  await delay(50);
  const normalize = value => value.replace(/\s+/g, ' ').trim();
  return normalize(editorText(editorFor(provider))) === normalize(desired);
}
const injectPromptToGemini = text => injectPromptFor('gemini', text);
const injectPromptToChatGPT = text => injectPromptFor('chatgpt', text);
const injectPromptToClaude = text => injectPromptFor('claude', text);
const injectPromptToPerplexity = text => injectPromptFor('perplexity', text);
const injectPrompt = text => injectPromptFor(detectActiveProvider(), text);

// Confirm a changed conversation or a cleared nonempty editor after one dispatch.
async function submitPrompt() {
  const provider = detectActiveProvider();
  const adapter = providerAdapters[provider];
  const editor = editorFor(provider);
  const textBefore = editorText(editor);
  const userMessages = () => document.querySelectorAll('[data-message-author-role="user"], [data-testid="user-message"], user-query, .user-query, [data-testid="user-query"]').length;
  const messageCount = userMessages();
  const responseBefore = document.querySelector('button[data-testid="stop-button"], button[aria-label*="Stop generating" i], button[aria-label*="Stop response" i]');
  let button = null;
  await waitForOutcome(() => {
    button = [...document.querySelectorAll(adapter.send)].find(node => visible(node) && !node.disabled && node.getAttribute('aria-disabled') !== 'true');
    return !!button && !uploadPending(provider);
  }, 1600);
  if (cancelled() || uploadPending(provider)) return false;
  if (button) button.click();
  else {
    // A disabled send control explicitly forbids submitting (e.g. upload or rate limit).
    if (document.querySelector(adapter.send) || !editor || (!textBefore && !attachmentNodes(provider).length)) return false;
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  }
  return waitForOutcome(() => {
    const response = document.querySelector('button[data-testid="stop-button"], button[aria-label*="Stop generating" i], button[aria-label*="Stop response" i]');
    return userMessages() > messageCount || (!!response && response !== responseBefore) || (textBefore.length > 0 && editorText(editor) === '');
  }, testMode ? 1200 : 8000);
}

const submitGemini = submitPrompt;

// Expose upload API for Glance AI multi-provider
if (testMode) contextBridge.exposeInMainWorld('upload', {
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
let pendingScroll = 0;
let scrollFrame = null;
function scrollChat(amount) {
  if (!Number.isFinite(amount)) return;
  pendingScroll += amount;
  if (scrollFrame !== null) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = null;
    const distance = pendingScroll;
    pendingScroll = 0;
    applyChatScroll(distance);
  });
}
function applyChatScroll(amount) {
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
      el.scrollBy({ top: amount, behavior: 'instant' });
      return;
    }
  }
  window.scrollBy({ top: amount, behavior: 'instant' });
}
const scrollGeminiChat = scrollChat;

// Floating Toast Notification
function showToast(text, durationMs = 2600) {
  let toast = document.getElementById('glance-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'glance-toast';
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

async function runRendererOperation(payload = {}, type) {
  if (rendererOperation) {
    if (payload.id) await ipcRenderer.invoke('operation-complete', { id: payload.id, ok: false, error: 'An operation is already in progress.' });
    return;
  }
  const operation = { id: payload.id, cancelled: false };
  rendererOperation = operation;
  let result = { id: payload.id, ok: false, error: 'Operation could not be completed.' };
  try {
    if (type === 'capture') {
      showToast('Attaching screenshot…');
      const uploadArgs = typeof payload === 'object'
        ? { dataUrl: payload.dataUrl, filename: payload.filename }
        : payload.dataUrl;
      if (!payload.dataUrl || !await uploadScreenshot(uploadArgs)) throw new Error('Attachment could not be confirmed. Check the image preview before retrying; nothing was auto-sent.');
      if (cancelled()) throw new Error('Operation cancelled.');
      if (payload.prompt && !await injectPrompt(payload.prompt)) throw new Error('Image attached, but the prompt could not be inserted. Check the conversation.');
      if (payload.autoSubmit) {
        if (!await submitPrompt()) throw new Error('Could not confirm sending. Check the conversation before retrying.');
        showToast('Sent successfully.');
      } else showToast('Image attached. Use Send when ready.');
    } else {
      showToast('Sending…');
      if (!await submitPrompt()) throw new Error('Could not confirm sending. Check the conversation before retrying.');
      showToast('Sent successfully.');
    }
    result = { id: payload.id, ok: !cancelled() };
  } catch (error) { result.error = error.message; if (!cancelled()) showToast(error.message, 6000); }
  finally {
    rendererOperation = null;
    if (payload.id) await ipcRenderer.invoke('operation-complete', result).catch(() => {});
  }
}
ipcRenderer.on('action:attach-screenshot', (_event, payload) => { void runRendererOperation(payload, 'capture'); });
ipcRenderer.on('action:submit', (_event, payload) => { void runRendererOperation(payload, 'submit'); });
ipcRenderer.on('action:cancel-operation', (_event, id) => { if (rendererOperation?.id === id) rendererOperation.cancelled = true; });

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
  const slider = document.getElementById('glance-opacity-slider');
  if (slider && Number.isFinite(val)) {
    slider.value = val;
  }
});

// 7. Show Toast Notification
ipcRenderer.on('action:show-toast', (_event, payload) => {
  const text = typeof payload === 'string' ? payload : payload?.message;
  const duration = typeof payload === 'object' && payload?.durationMs ? payload.durationMs : 2600;
  if (text && !isDashboard) showToast(text, duration);
});

// Once DOM is ready, inject our custom floating top bar (strictly on supported AI overlays, never Dashboard or Google Accounts auth)
function safeInjectHeader() {
  if (typeof window === 'undefined' || !window.location) return;
  const href = window.location.href || '';
  const hostname = window.location.hostname || '';

  // Do not inject on local dashboard or Google accounts authentication
  if (href.includes('dashboard.html') || hostname.includes('accounts.google.com')) {
    return;
  }

  // Only inject toolbar on supported AI providers or local test mock
  const isSupportedApp = ['gemini.google.com', 'chatgpt.com', 'chat.openai.com', 'claude.ai', 'perplexity.ai', 'www.perplexity.ai'].includes(hostname) || testMode;

  if (!isSupportedApp) {
    return;
  }

  if (document.getElementById('glance-toolbar')) return;
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', () => injectToolbarHeader(), { once: true });
    return;
  }
  injectToolbarHeader();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', safeInjectHeader, { once: true });
} else {
  safeInjectHeader();
}

function updateFocusButton(isFocusable) {
  const btn = document.getElementById('glance-focus-btn');
  if (!btn) return;
  const stateEl = btn.querySelector('.btn-state');
  if (stateEl) {
    stateEl.textContent = isFocusable ? 'ON' : 'OFF';
  } else {
    btn.textContent = isFocusable ? 'Focus: ON' : 'Focus: OFF';
  }
  if (isFocusable) {
    btn.classList.add('active');
    btn.title = 'Focus Mode active: clicking will activate overlay & allow typing (Ctrl+F to toggle)';
  } else {
    btn.classList.remove('active');
    btn.title = 'Focus Mode non-intrusive: clicking will NOT unfocus other apps (Ctrl+F to toggle)';
  }
}

function updateClickThroughButton(isClickThrough) {
  const btn = document.getElementById('glance-clickthru-btn');
  if (!btn) return;
  const stateEl = btn.querySelector('.btn-state');
  if (stateEl) {
    stateEl.textContent = isClickThrough ? 'ON' : 'OFF';
  } else {
    btn.textContent = isClickThrough ? 'Click-Thru: ON' : 'Click-Thru: OFF';
  }
  if (isClickThrough) {
    btn.classList.add('active');
    btn.title = 'Click-through active: clicks pass through overlay to underlying apps. Hover toolbar or press Ctrl+M to toggle.';
  } else {
    btn.classList.remove('active');
    btn.title = 'Click-through inactive: normal interaction with overlay (Ctrl+M to toggle)';
  }
}

function injectToolbarHeader() {
  if (document.getElementById('glance-toolbar')) return;

  const style = document.createElement('style');
  style.id = 'glance-styles';
  style.textContent = `
    #glance-toolbar,
    #glance-toolbar * {
      box-sizing: border-box !important;
    }
    #glance-toolbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 30px;
      background: rgba(15, 17, 23, 0.94);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      z-index: 99999999;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px;
      color: #e2e8f0;
      user-select: none;
      -webkit-app-region: drag;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
      gap: 6px;
    }
    #glance-toolbar .brand {
      display: flex;
      align-items: center;
      gap: 5px;
      font-weight: 600;
      color: #60a5fa;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }
    #glance-toolbar .brand svg {
      width: 13px;
      height: 13px;
      fill: #60a5fa;
    }
    #glance-toolbar .controls {
      display: flex;
      align-items: center;
      gap: 3px;
      -webkit-app-region: no-drag;
      flex-shrink: 1;
      min-width: 0;
      overflow-x: auto;
      scrollbar-width: none;
    }
    #glance-toolbar .controls::-webkit-scrollbar {
      display: none;
    }
    .glance-btn {
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      padding: 2px 6px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 10.5px;
      font-weight: 500;
      line-height: 1.2 !important;
      margin: 0 !important;
      text-transform: none !important;
      text-decoration: none !important;
      transition: background-color 0.15s ease, color 0.15s ease;
      display: flex;
      align-items: center;
      gap: 2px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .glance-btn:hover {
      background: rgba(255, 255, 255, 0.16);
      color: #fff;
    }
    .glance-btn.active {
      background: #2563eb;
      border-color: #3b82f6;
      color: #fff;
    }
    .glance-slider-wrap {
      display: flex;
      align-items: center;
      gap: 3px;
      color: #94a3b8;
      font-size: 10px;
      flex-shrink: 0;
    }
    .glance-slider {
      width: 40px;
      height: 4px;
      accent-color: #3b82f6;
      cursor: pointer;
    }
    .btn-text-short {
      display: none;
    }
    @media (max-width: 540px) {
      .glance-slider-wrap span {
        display: none !important;
      }
      .glance-slider {
        width: 32px !important;
      }
      .glance-btn {
        padding: 2px 4px !important;
        font-size: 10px !important;
      }
      #glance-toolbar {
        padding: 0 5px !important;
        gap: 3px !important;
      }
      #glance-toolbar .controls {
        gap: 2px !important;
      }
    }
    @media (max-width: 480px) {
      #glance-toolbar .brand span {
        display: none !important;
      }
      .btn-text-full {
        display: none !important;
      }
      .btn-text-short {
        display: inline !important;
      }
    }
    @media (max-width: 380px) {
      .glance-slider-wrap {
        display: none !important;
      }
      .glance-btn {
        padding: 2px 3px !important;
        font-size: 9.5px !important;
      }
      #glance-toolbar {
        padding: 0 4px !important;
        gap: 2px !important;
      }
    }
    body {
      padding-top: 30px !important;
      box-sizing: border-box !important;
    }
    header, [role="banner"], bard-mode-switcher, .app-header, .top-bar, nav.sticky {
      top: 30px !important;
    }
  `;
  document.head.appendChild(style);

  const toolbar = document.createElement('div');
  toolbar.id = 'glance-toolbar';
  trustedControls(toolbar);
  toolbar.innerHTML = `
    <div class="brand">
      <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      <span>Glance AI</span>
    </div>
    <div class="controls">
      <button id="glance-clickthru-btn" class="glance-btn" title="Toggle Click-Through Mode (Ctrl+M)">
        <span class="btn-text-full">Click-Thru: </span><span class="btn-text-short">Thru: </span><span class="btn-state">OFF</span>
      </button>
      <button id="glance-focus-btn" class="glance-btn active" title="Toggle Focus Mode (Ctrl+F)">
        <span class="btn-text-full">Focus: </span><span class="btn-text-short">Foc: </span><span class="btn-state">ON</span>
      </button>
      <button id="glance-snap-btn" class="glance-btn" title="Capture Workspace (Ctrl+S)">
        <span class="btn-text-full">Capture</span><span class="btn-text-short">Snap</span>
      </button>
      <button id="glance-send-btn" class="glance-btn" title="Send Message (Ctrl+Enter)">
        Send
      </button>
      <div class="glance-slider-wrap" title="Adjust Window Opacity (Ctrl+[ or Ctrl+])">
        <span>Opacity</span>
        <input type="range" id="glance-opacity-slider" class="glance-slider" min="0.15" max="1.0" step="0.05" value="0.95">
      </div>
      <button id="glance-settings-btn" class="glance-btn" title="Keyboard Shortcuts (Hotkeys)">
        <span class="btn-text-full">Hotkeys</span><span class="btn-text-short">Keys</span>
      </button>
      <button id="glance-menu-btn" class="glance-btn" title="Dashboard Menu (Ctrl+B)">Menu</button>
      <button id="glance-hide-btn" class="glance-btn" title="Hide Overlay (Ctrl+H)">Hide</button>
      <button id="glance-close-btn" class="glance-btn" title="Close App (Ctrl+Shift+Q)">✕</button>
    </div>
  `;

  document.body.prepend(toolbar);

  // Bind toolbar event listeners
  const clickthruBtn = toolbar.querySelector('#glance-clickthru-btn');
  const focusBtn = toolbar.querySelector('#glance-focus-btn');
  const snapBtn = toolbar.querySelector('#glance-snap-btn');
  const sendBtn = toolbar.querySelector('#glance-send-btn');
  const opacitySlider = toolbar.querySelector('#glance-opacity-slider');
  const settingsBtn = toolbar.querySelector('#glance-settings-btn');
  const hideBtn = toolbar.querySelector('#glance-hide-btn');
  const closeBtn = toolbar.querySelector('#glance-close-btn');

  // Automatic hover detection: when mouse is over toolbar, allow clicks on toolbar!
  toolbar.addEventListener('mouseenter', () => {
    isToolbarHovered = true;
    ipcRenderer.invoke('set-ignore-mouse-events', false);
  });

  toolbar.addEventListener('mouseleave', async () => {
    isToolbarHovered = false;
    if (document.getElementById('glance-modal-overlay')) {
      return;
    }

    const isCt = await ipcRenderer.invoke('get-click-through');
    isClickThroughActive = !!isCt;

    if (!isToolbarHovered && isClickThroughActive && !document.getElementById('glance-modal-overlay')) {
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
    if (settings) refreshSettings(settings);
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
    snapBtn.innerHTML = '<span class="btn-text-full">Attaching...</span><span class="btn-text-short">Wait...</span>';
    try {
      const result = await ipcRenderer.invoke('capture-and-attach');
      if (!result.ok) showToast(result.error);
    } catch (error) {
      showToast(error.message);
    } finally {
      snapBtn.disabled = false;
      snapBtn.innerHTML = '<span class="btn-text-full">Capture</span><span class="btn-text-short">Snap</span>';
    }
  });

  // Send Button
  sendBtn.addEventListener('click', async () => {
    showToast('Sending...');
    try { const result = await ipcRenderer.invoke('submit-message'); if (!result.ok) showToast(result.error); }
    catch (error) { showToast(error.message); }
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

  const menuBtn = toolbar.querySelector('#glance-menu-btn');
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
let closeHotkeysModal = null;
function openSettingsModal() {
  const existing = document.getElementById('glance-modal-overlay');
  if (existing) {
    closeHotkeysModal?.();
    return;
  }

  ipcRenderer.invoke('set-ignore-mouse-events', false);

  ipcRenderer.invoke('get-settings').then((settings) => {
    const modalWrap = document.createElement('div');
    modalWrap.id = 'glance-modal-overlay';
    trustedControls(modalWrap);
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
      box-sizing: border-box;
      padding: 12px;
    `;

    modalWrap.innerHTML = `
      <div style="
        background: #18181b;
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 10px;
        width: 380px;
        max-width: 100%;
        box-sizing: border-box;
        padding: 18px 20px;
        color: #f4f4f5;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      ">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="margin:0; font-size:14px; color:#60a5fa; font-weight:600; display:flex; align-items:center; gap:6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/></svg>
            Keyboard Shortcuts (Hotkeys)
          </h3>
          <button id="modal-close" style="background:none; border:none; color:#a1a1aa; cursor:pointer; font-size:16px;">✕</button>
        </div>

        <div style="font-size:11px; color:#d4d4d8; margin-bottom:14px; line-height:1.7; background:rgba(255,255,255,0.04); padding:10px 12px; border-radius:6px;">
          <div style="display:flex; justify-content:space-between;"><span><strong>Ctrl + S</strong></span><span style="color:#94a3b8;">Screenshot Workspace & Attach</span></div>
          <div style="display:flex; justify-content:space-between;"><span><strong>Ctrl + Enter</strong></span><span style="color:#94a3b8;">Send Prompt to AI</span></div>
          <div style="display:flex; justify-content:space-between;"><span><strong>Ctrl + F</strong></span><span style="color:#94a3b8;">Toggle Focus (Typing / Non-Intrusive)</span></div>
          <div style="display:flex; justify-content:space-between;"><span><strong>Ctrl + M</strong></span><span style="color:#94a3b8;">Toggle Click-Through Mode</span></div>
          <div style="display:flex; justify-content:space-between;"><span><strong>Ctrl + H</strong></span><span style="color:#94a3b8;">Hide / Show Window (Boss Key)</span></div>
          <div style="display:flex; justify-content:space-between;"><span><strong>Ctrl + B</strong></span><span style="color:#94a3b8;">Open Full Settings Dashboard</span></div>
          <div style="display:flex; justify-content:space-between;"><span><strong>Ctrl + Arrows</strong></span><span style="color:#94a3b8;">Nudge Window (40px)</span></div>
          <div style="display:flex; justify-content:space-between;"><span><strong>Ctrl + Shift + Arrows</strong></span><span style="color:#94a3b8;">Scroll Chat History</span></div>
          <div style="display:flex; justify-content:space-between;"><span><strong>Ctrl + [ / ]</strong></span><span style="color:#94a3b8;">Adjust Opacity</span></div>
          <div style="display:flex; justify-content:space-between;"><span><strong>Ctrl + Shift + Q</strong></span><span style="color:#94a3b8;">Exit Glance AI</span></div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center;">
          <button id="modal-dashboard-btn" style="
            background: rgba(255,255,255,0.08);
            color: #cbd5e1;
            border: 1px solid rgba(255,255,255,0.12);
            padding: 5px 12px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 11px;
          ">Open Dashboard (Ctrl+B)</button>
          <button id="modal-done-btn" style="
            background: #2563eb;
            color: #fff;
            border: none;
            padding: 5px 14px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 500;
          ">Done</button>
        </div>
      </div>
    `;

    const shortcutActions = ['screenshot', 'send', 'toggleFocus', 'toggleClickThrough', 'toggleVisibility', 'returnHome', 'moveUp', 'scrollUp', 'opacityDown', 'emergencyExit'];
    modalWrap.querySelectorAll('strong').forEach((label, i) => { if (shortcutActions[i]) label.textContent = formatShortcut(settings.shortcuts?.[shortcutActions[i]] || ''); });
    document.body.appendChild(modalWrap);

    modalWrap.addEventListener('mouseenter', () => {
      ipcRenderer.invoke('set-ignore-mouse-events', false);
    });

    const onKeyDown = (e) => {
      if ((e.isTrusted || testMode) && e.key === 'Escape') {
        closeModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    const closeModal = () => {
      window.removeEventListener('keydown', onKeyDown);
      modalWrap.remove();
      if (isClickThroughActive) {
        ipcRenderer.invoke('set-ignore-mouse-events', true, { forward: true });
      }
    };

    modalWrap.querySelector('#modal-close').onclick = closeModal;
    closeHotkeysModal = closeModal;
    modalWrap.querySelector('#modal-done-btn').onclick = closeModal;
    const dashboardBtn = modalWrap.querySelector('#modal-dashboard-btn');
    if (dashboardBtn) {
      dashboardBtn.onclick = () => {
        closeModal();
        ipcRenderer.invoke('open-dashboard');
      };
    }
    modalWrap.onclick = (e) => {
      if (e.target === modalWrap) closeModal();
    };


  });
}

function refreshSettings(settings) {
  if (isDashboard) return;
  isClickThroughActive = !!settings.clickThrough;
  if (isToolbarHovered || document.getElementById('glance-modal-overlay')) ipcRenderer.invoke('set-ignore-mouse-events', false).catch(() => {});
  updateFocusButton(settings.focusable); updateClickThroughButton(settings.clickThrough);
  const slider = document.getElementById('glance-opacity-slider'); if (slider) slider.value = settings.opacity;
  const labels = { 'glance-snap-btn': 'screenshot', 'glance-send-btn': 'send', 'glance-focus-btn': 'toggleFocus', 'glance-clickthru-btn': 'toggleClickThrough', 'glance-menu-btn': 'returnHome', 'glance-hide-btn': 'toggleVisibility', 'glance-close-btn': 'emergencyExit' };
  for (const [id, action] of Object.entries(labels)) {
    const button = document.getElementById(id);
    if (button) button.title = formatShortcut(settings.shortcuts?.[action] || '');
  }
}
function formatShortcut(value) { return value.replaceAll('CommandOrControl', 'Ctrl').replaceAll('Return', 'Enter').replaceAll('+', ' + '); }
ipcRenderer.on('action:settings-changed', (_event, settings) => refreshSettings(settings));
