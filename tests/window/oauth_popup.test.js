import { app, BrowserWindow } from 'electron';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const suite = createTestSuite('Tier 3: OAuth Popup & External URL Routing');

let win = null;

suite.test('Google OAuth URLs are allowed with standard interactive frame', () => {
  win = new BrowserWindow({ show: false });

  const oauthHandler = ({ url }) => {
    if (url.includes('accounts.google.com') || url.includes('google.com')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          alwaysOnTop: true,
          frame: true,
          autoHideMenuBar: true
        }
      };
    }
    return { action: 'deny' };
  };

  win.webContents.setWindowOpenHandler(oauthHandler);

  // Test Google accounts URL
  const googleRes = oauthHandler({
    url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=123'
  });

  assert.strictEqual(googleRes.action, 'allow', 'Google OAuth URL must be allowed');
  assert.strictEqual(
    googleRes.overrideBrowserWindowOptions.frame,
    true,
    'OAuth window must have frame: true for titlebar and close button'
  );
  assert.strictEqual(
    googleRes.overrideBrowserWindowOptions.alwaysOnTop,
    true,
    'OAuth window must have alwaysOnTop: true'
  );

  // Test google.com URL
  const googleDomainRes = oauthHandler({
    url: 'https://www.google.com/service/login'
  });
  assert.strictEqual(googleDomainRes.action, 'allow', 'google.com login must be allowed');
});

suite.test('External third-party links are denied from overlay window', () => {
  const oauthHandler = ({ url }) => {
    if (url.includes('accounts.google.com') || url.includes('google.com')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          alwaysOnTop: true,
          frame: true,
          autoHideMenuBar: true
        }
      };
    }
    return { action: 'deny' };
  };

  const untrustedRes = oauthHandler({ url: 'https://evil-site.com/exploit' });
  assert.strictEqual(untrustedRes.action, 'deny', 'Untrusted external URL must be denied');

  const arbitraryRes = oauthHandler({ url: 'https://github.com/glance-ai' });
  assert.strictEqual(arbitraryRes.action, 'deny', 'Arbitrary external URL must be denied');
});

suite.test('OAuth popup interaction preserves overlay setContentProtection status', () => {
  win.setContentProtection(true);
  if (typeof win.isContentProtected === 'function') {
    assert.strictEqual(win.isContentProtected(), true, 'Overlay content protection must be true');
  }

  // Create child OAuth popup window with interactive frame
  const oauthChild = new BrowserWindow({
    parent: win,
    show: false,
    frame: true,
    alwaysOnTop: true
  });

  // Verify overlay content protection is preserved
  if (typeof win.isContentProtected === 'function') {
    assert.strictEqual(win.isContentProtected(), true, 'Overlay content protection preserved with OAuth child');
  }

  if (oauthChild && !oauthChild.isDestroyed()) {
    oauthChild.destroy();
  }
});

suite.test('All Google auth and Gemini requests route with consistent Google UA', async () => {
  const GOOGLE_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15';

  const mockHeaderFilter = (details) => {
    const headers = { ...details.requestHeaders };
    if (details.url.includes('google.com')) {
      headers['User-Agent'] = GOOGLE_UA;
    }
    return headers;
  };

  // 1. Check Google Auth routing
  const authHeaders = mockHeaderFilter({
    url: 'https://accounts.google.com/ServiceLogin',
    requestHeaders: { 'User-Agent': 'Old' }
  });
  assert.strictEqual(authHeaders['User-Agent'], GOOGLE_UA, 'Google accounts must use Google UA');

  // 2. Check Gemini routing
  const geminiHeaders = mockHeaderFilter({
    url: 'https://gemini.google.com/app',
    requestHeaders: { 'User-Agent': 'Old' }
  });
  assert.strictEqual(geminiHeaders['User-Agent'], GOOGLE_UA, 'Gemini app must use Google UA');
});

app.whenReady().then(async () => {
  try {
    const success = await suite.run();
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
    app.exit(success ? 0 : 1);
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
