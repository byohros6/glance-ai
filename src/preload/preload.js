import { contextBridge, ipcRenderer, webFrame } from 'electron';

// Remove webdriver indicator to ensure seamless Google login
try {
  delete Object.getPrototypeOf(navigator).webdriver;
} catch (e) {}
try {
  delete navigator.webdriver;
} catch (e) {}

// Expose API to renderer
contextBridge.exposeInMainWorld('undecgpt', {
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
  onShortcutAction: (callback) => {
    ipcRenderer.on('shortcut-action', (_event, action, payload) => callback(action, payload));
  }
});

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

// Injects File into HTMLInputElement and dispatches input & change events
function injectFileFromDataUrl(input, dataUrl, filename = 'screenshot.png') {
  const [meta, b64] = dataUrl.split(',');
  const mime = (meta.split(':')[1] || 'image/png').split(';')[0];
  const byteString = atob(b64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const file = new File([new Blob([ab], { type: mime })], filename, { type: mime });
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
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
        console.log('[UndecGPT] Intercepted file input click; injected screenshot successfully!');
      } catch (e) {
        console.error('[UndecGPT] File injection error:', e);
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
 * Installs the click interceptor inside Gemini's main-world context via webFrame.
 * This guarantees that when Gemini's page script invokes .click() on the hidden file input,
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
              console.error('[UndecGPT-MainWorld] Error injecting file:', err);
            }
          }

          HTMLInputElement.prototype.click = function () {
            if (!window.__undec_interceptor_state.intercepted && this.type === 'file') {
              window.__undec_interceptor_state.intercepted = true;
              HTMLInputElement.prototype.click = originalClick;
              window.__undec_interceptor_state.installed = false;
              injectFile(this, ${JSON.stringify(dataUrl)}, 'screenshot.png');
              console.log('[UndecGPT-MainWorld] Intercepted file input click; suppressed native file dialog');
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
    console.warn('[UndecGPT] installMainWorldClickInterceptor warning:', err);
  }
}

/**
 * Executes WhisprGPT's exact 2-step trigger sequence for Gemini:
 * Step 1: Click '[aria-label="Upload & tools"]' (reveals upload options)
 * Step 2: Arm click interceptor and click '[data-test-id="hidden-local-file-upload-button"]'
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
      console.warn('[UndecGPT] triggerSequence element not found:', sel);
      continue;
    }

    console.log(`[UndecGPT] triggerSequence step ${i + 1}/${strategy.triggerSelectors.length}:`, sel, el.tagName);

    // Arm the interceptor in both preload context and main world right before the final trigger click
    if (i === strategy.triggerSelectors.length - 1) {
      interceptor = installFileInputClickInterceptor(dataUrl, interceptorAutoRestoreMs);
      installMainWorldClickInterceptor(dataUrl, interceptorAutoRestoreMs);
    }
    el.click();
  }

  await new Promise((r) => setTimeout(r, gapMs));

  // Check if main world or preload intercepted the click
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

  // Fallback if interceptor didn't catch a click
  if (!wasIntercepted) {
    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    console.log(`[UndecGPT] Checking direct inputs: found ${inputs.length}`);
    if (inputs.length > 0) {
      const lastInput = inputs[inputs.length - 1];
      injectFileFromDataUrl(lastInput, dataUrl);
      console.log('[UndecGPT] Injected screenshot directly into input[type="file"]');
      return true;
    }

    // Direct clipboard paste fallback into Gemini editor
    console.log('[UndecGPT] Attempting synthetic paste fallback into editor...');
    const editor = document.querySelector('rich-textarea .ql-editor') || document.querySelector('[contenteditable="true"]');
    if (editor) {
      try {
        const [meta, b64] = dataUrl.split(',');
        const mime = (meta.split(':')[1] || 'image/png').split(';')[0];
        const byteString = atob(b64);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        const file = new File([new Blob([ab], { type: mime })], 'screenshot.png', { type: mime });

        const dt = new DataTransfer();
        dt.items.add(file);
        editor.focus();
        const pasteEvent = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt
        });
        editor.dispatchEvent(pasteEvent);
        console.log('[UndecGPT] Synthetic paste event dispatched');
        return true;
      } catch (err) {
        console.warn('[UndecGPT] Paste fallback error:', err);
      }
    }
  }

  return true;
}

// Injects image into Gemini
async function uploadScreenshotToGemini(arg) {
  const dataUrl = typeof arg === 'string' ? arg : arg?.dataUrl;
  if (!dataUrl) return false;

  console.log('[UndecGPT] Uploading screenshot to Gemini via trigger sequence...');
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

// Injects prompt into Gemini's Quill / rich-textarea editor
async function injectPromptToGemini(promptText) {
  if (!promptText) return false;
  console.log('[UndecGPT] Injecting prompt text into Gemini editor...');
  const editor =
    (await waitForElement('rich-textarea .ql-editor', 3000)) ||
    document.querySelector('.ql-editor') ||
    document.querySelector('[contenteditable="true"]');

  if (!editor) {
    console.warn('[UndecGPT] Could not find Gemini editor element');
    return false;
  }

  editor.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, promptText);

  editor.dispatchEvent(new Event('input', { bubbles: true }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// Submits the Gemini query
async function submitGemini() {
  console.log('[UndecGPT] Submitting message to Gemini...');
  const submitSelectors = [
    '[aria-label="Send message"]',
    '[aria-label="Send prompt"]',
    'button.send-button',
    'button[aria-label*="Send" i]'
  ];

  for (let attempt = 0; attempt < 8; attempt++) {
    for (const sel of submitSelectors) {
      const btn = document.querySelector(sel);
      if (btn && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true') {
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        btn.dispatchEvent(clickEvent);
        console.log('[UndecGPT] Clicked submit button:', sel);
        return true;
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  // Fallback: enter key on editor
  const editor = document.querySelector('rich-textarea .ql-editor') || document.querySelector('[contenteditable="true"]');
  if (editor) {
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    return true;
  }

  console.warn('[UndecGPT] Submit button was not ready or enabled');
  return false;
}

// Expose upload API matching WhisprGPT
contextBridge.exposeInMainWorld('upload', {
  uploadImage: (args) => uploadScreenshotToGemini(args),
  waitForElement: (selector, timeoutMs) => waitForElement(selector, timeoutMs),
  uploadPrompt: (promptText) => injectPromptToGemini(promptText),
  submitPrompt: () => submitGemini()
});

// Scrolls Gemini chat
function scrollGeminiChat(amount) {
  const scrollSelectors = [
    'infinite-scroller.chat-history',
    '.chat-history',
    'main',
    '.conversation-container',
    '[class*="scroller"]'
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
ipcRenderer.on('action:attach-screenshot', async (_event, { dataUrl, prompt }) => {
  showToast('📸 Attaching screenshot...');
  if (dataUrl) {
    await uploadScreenshotToGemini(dataUrl);
    await new Promise((r) => setTimeout(r, 500));
  }

  if (prompt) {
    await injectPromptToGemini(prompt);
  }

  showToast('✅ Attached! Press Ctrl+Enter to send.');
});

// 2. Submit Message (Ctrl + Enter)
ipcRenderer.on('action:submit', async () => {
  showToast('🚀 Sending...');
  const success = await submitGemini();
  if (success) {
    showToast('✅ Sent to Gemini!');
  } else {
    showToast('⚠️ Send button not ready yet');
  }
});

// 3. Scroll Chat
ipcRenderer.on('action:scroll', (_event, amount) => {
  scrollGeminiChat(amount);
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

// Once DOM is ready, inject our custom stealth floating top bar
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    injectStealthHeader();
  });
} else {
  injectStealthHeader();
}

function updateFocusButton(isFocusable) {
  const btn = document.getElementById('undec-focus-btn');
  if (!btn) return;
  if (isFocusable) {
    btn.innerHTML = '🎯 Focus: ON';
    btn.classList.add('active');
    btn.title = 'Focusable mode: clicking will activate window & allow typing in Gemini (Ctrl+F to toggle)';
  } else {
    btn.innerHTML = '🔒 Focus: OFF';
    btn.classList.remove('active');
    btn.title = 'Non-focusable mode: clicking will NOT unfocus other apps, typing disabled in Gemini (Ctrl+F to toggle)';
  }
}

function updateClickThroughButton(isClickThrough) {
  const btn = document.getElementById('undec-clickthru-btn');
  if (!btn) return;
  if (isClickThrough) {
    btn.innerHTML = '👻 Click-Thru: ON';
    btn.classList.add('active');
    btn.title = 'Click-through active: all clicks pass through to apps behind Gemini. Hover toolbar or press Ctrl+M to toggle.';
  } else {
    btn.innerHTML = '🖱️ Click-Thru: OFF';
    btn.classList.remove('active');
    btn.title = 'Click-through inactive: normal interaction with Gemini (Ctrl+M to toggle)';
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
      <span>UndecGPT</span>
      <span class="undec-badge" title="Invisible to screen recordings and screen shares">🛡️ Ghost</span>
    </div>
    <div class="controls">
      <button id="undec-clickthru-btn" class="undec-btn" title="Toggle Click-Through Mode (Ctrl+M)">
        🖱️ Click-Thru: OFF
      </button>
      <button id="undec-focus-btn" class="undec-btn active" title="Toggle Focusable Mode (Ctrl+F)">
        🎯 Focus: ON
      </button>
      <button id="undec-snap-btn" class="undec-btn" title="Attach Screenshot (Ctrl+S)">
        📸 Attach
      </button>
      <button id="undec-send-btn" class="undec-btn" title="Send to Gemini (Ctrl+Enter)">
        🚀 Send
      </button>
      <div class="undec-slider-wrap" title="Adjust Window Opacity (Ctrl+[ or Ctrl+])">
        <span>Opacity</span>
        <input type="range" id="undec-opacity-slider" class="undec-slider" min="0.15" max="1.0" step="0.05" value="0.95">
      </div>
      <button id="undec-settings-btn" class="undec-btn" title="Settings & Prompt">⚙️</button>
      <button id="undec-hide-btn" class="undec-btn" title="Hide Overlay (Ctrl+H)">👁️</button>
      <button id="undec-close-btn" class="undec-btn" title="Emergency Exit (Ctrl+Shift+Q)">✕</button>
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
    // If settings modal is open, DO NOT re-enable click-through!
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
        ? '👻 Click-Through: ON (clicks pass through to apps underneath)'
        : '🖱️ Click-Through: OFF (normal interaction)'
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
        ? '🎯 Focus: ON (typing enabled)'
        : '🔒 Focus: OFF (stealth clicks won\'t unfocus other apps)'
    );
  });

  // Attach Screen Button
  snapBtn.addEventListener('click', async () => {
    snapBtn.disabled = true;
    snapBtn.textContent = '⏳ Attaching...';
    try {
      const dataUrl = await ipcRenderer.invoke('take-screenshot');
      const settings = await ipcRenderer.invoke('get-settings');
      if (dataUrl) {
        await uploadScreenshotToGemini(dataUrl);
        await new Promise((r) => setTimeout(r, 500));
        await injectPromptToGemini(settings.prompt);
        showToast('✅ Attached! Press Ctrl+Enter to send.');
      }
    } finally {
      snapBtn.disabled = false;
      snapBtn.textContent = '📸 Attach';
    }
  });

  // Send Button
  sendBtn.addEventListener('click', async () => {
    showToast('🚀 Sending...');
    const success = await submitGemini();
    if (success) {
      showToast('✅ Sent to Gemini!');
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

  // Ensure modal can receive clicks
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
          <h3 style="margin:0; font-size:15px; color:#60a5fa; font-weight:600;">UndecGPT Settings</h3>
          <button id="modal-close" style="background:none; border:none; color:#a1a1aa; cursor:pointer; font-size:16px;">✕</button>
        </div>
        
        <label style="display:block; font-size:12px; font-weight:500; margin-bottom:6px; color:#d4d4d8;">
          Default Screen-Solve Prompt:
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
            <strong>Window Focusable Mode</strong><br>
            <span style="color:#a1a1aa; font-size:11px;">
              When unchecked, clicking on UndecGPT will NOT steal focus from other apps you are using.
            </span>
          </span>
        </label>

        <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; margin-bottom:14px; cursor:pointer;">
          <input type="checkbox" id="modal-clickthru" ${settings.clickThrough ? 'checked' : ''} style="accent-color:#3b82f6; margin-top:2px;">
          <span>
            <strong>Click-Through Mode</strong><br>
            <span style="color:#a1a1aa; font-size:11px;">
              Pass all clicks directly through Gemini to whatever application is underneath.
            </span>
          </span>
        </label>

        <div style="font-size:11px; color:#a1a1aa; margin-bottom:16px; line-height:1.6; background:rgba(255,255,255,0.04); padding:8px 10px; border-radius:6px;">
          <div><strong>Ctrl + S</strong>: Screenshot & Attach to Gemini</div>
          <div><strong>Ctrl + Enter</strong>: Send Prompt to Gemini</div>
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

    // Prevent click-through from taking over while interacting with modal
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
