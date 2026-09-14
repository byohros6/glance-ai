/**
 * UndecGPT Main-World Injection Script
 *
 * Executes in Google Gemini's main execution context to intercept native file dialogs,
 * inject screenshots via DataTransfer, and dispatch prompt text.
 */

(function () {
  if (window.__undecgpt_injected) return;
  window.__undecgpt_injected = true;

  window.__undec_interceptor_state = {
    intercepted: false,
    installed: false
  };

  /**
   * Decodes a base64 Data URL and populates an input[type="file"] via DataTransfer.
   * @param {HTMLInputElement} input
   * @param {string} dataUrl
   * @param {string} [filename='screenshot.png']
   */
  window.__undec_injectFile = function (input, dataUrl, filename = 'screenshot.png') {
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
      const file = new File([new Blob([ab], { type: mime })], filename, { type: mime });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (err) {
      console.error('[UndecGPT-MainWorld] Error injecting file:', err);
      return false;
    }
  };

  /**
   * Installs the monkey-patch on HTMLInputElement.prototype.click in the main world.
   * When Gemini's page script calls .click() on the hidden file input, this interceptor
   * catches it, suppresses the native Windows File Picker dialog, attaches the screenshot,
   * and dispatches change/input events.
   * @param {string} dataUrl
   * @param {number} [autoRestoreMs=3500]
   */
  window.__undec_installClickInterceptor = function (dataUrl, autoRestoreMs = 3500) {
    const originalClick = HTMLInputElement.prototype.click;
    window.__undec_interceptor_state.intercepted = false;
    window.__undec_interceptor_state.installed = true;

    HTMLInputElement.prototype.click = function () {
      if (!window.__undec_interceptor_state.intercepted && this.type === 'file') {
        window.__undec_interceptor_state.intercepted = true;
        HTMLInputElement.prototype.click = originalClick;
        window.__undec_interceptor_state.installed = false;

        window.__undec_injectFile(this, dataUrl, 'screenshot.png');
        console.log('[UndecGPT-MainWorld] Intercepted file input click; suppressed native file dialog and injected screenshot');
        return;
      }
      return originalClick.apply(this);
    };

    setTimeout(() => {
      if (window.__undec_interceptor_state.installed) {
        HTMLInputElement.prototype.click = originalClick;
        window.__undec_interceptor_state.installed = false;
      }
    }, autoRestoreMs);
  };
})();
