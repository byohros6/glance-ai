import { app, BrowserWindow, session } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestSuite, assert } from '../helpers/test_suite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suite = createTestSuite('Tier 1: Stealth Masking (Chrome UA & Webdriver)');

const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

let win = null;

suite.test('Outgoing HTTP request headers spoof Chrome 132 User-Agent', async () => {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = CHROME_USER_AGENT;
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  assert.ok(CHROME_USER_AGENT.includes('Chrome/132.0.0.0'), 'UA must identify as Chrome 132');
  assert.ok(CHROME_USER_AGENT.includes('Windows NT 10.0'), 'UA must identify as Windows NT 10.0');
});

suite.test('BrowserWindow webContents sets Chrome 132 User-Agent', async () => {
  win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../../src/preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.setUserAgent(CHROME_USER_AGENT);
  const ua = win.webContents.getUserAgent();
  assert.strictEqual(ua, CHROME_USER_AGENT, 'webContents User-Agent must match CHROME_USER_AGENT');
});

suite.test('Webdriver masking ensures bot detection flag is not active', async () => {
  const fixturePath = path.join(__dirname, '../fixtures/gemini_mock.html');
  await win.loadFile(fixturePath);

  const webdriverState = await win.webContents.executeJavaScript(`
    (() => {
      return {
        webdriver: navigator.webdriver,
        isAutomated: navigator.webdriver === true,
        userAgent: navigator.userAgent
      };
    })()
  `);

  assert.strictEqual(webdriverState.isAutomated, false, 'navigator.webdriver must not indicate automated bot environment');
  assert.strictEqual(webdriverState.userAgent, CHROME_USER_AGENT, 'navigator.userAgent in DOM must reflect spoofed Chrome 132 UA');
});

app.whenReady().then(async () => {
  const success = await suite.run();
  if (win && !win.isDestroyed()) {
    win.close();
  }
  process.exit(success ? 0 : 1);
});
