// Authentication windows intentionally expose no app or upload APIs.
const { webFrame } = require('electron');

// Intercept background WebAuthn conditional mediation (passkey autofill) to prevent Windows Security modal
try {
  webFrame.executeJavaScript(`
    (() => {
      if (typeof window !== 'undefined' && navigator.credentials && typeof navigator.credentials.get === 'function') {
        const origGet = navigator.credentials.get.bind(navigator.credentials);
        const patchedGet = function(options) {
          if (options && options.mediation === 'conditional') {
            return Promise.reject(new DOMException('Conditional mediation aborted', 'AbortError'));
          }
          return origGet(options);
        };
        patchedGet.toString = () => 'function get() { [native code] }';
        navigator.credentials.get = patchedGet;
      }
    })();
  `);
} catch {}
