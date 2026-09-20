import { app } from 'electron';
import { isAllowedWebURL, isExternalURL, isTrustedSender } from '../../src/main/security.js';
import { normalizeAccelerator, validateShortcuts } from '../../src/main/shortcuts.js';
import { DEFAULT_SETTINGS } from '../../src/main/store.js';
import { evaluateResult } from '../helpers/process_result.js';
import { createPermissionPolicy } from '../../src/main/permissions.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';
const suite = createTestSuite('Security boundaries, shortcut validation, and truthful runner results');
suite.test('Permissions require consent and media grants cannot cross origins or devices', () => {
  const policy = createPermissionPolicy();
  const url = 'https://chatgpt.com/';
  assert.equal(policy.check(url, 'media', { mediaType: 'audio' }), false);
  policy.grant(url, 'media', { mediaTypes: ['audio'] });
  assert.equal(policy.check(url, 'media', { mediaType: 'audio' }), true);
  assert.equal(policy.check(url, 'media', { mediaType: 'video' }), false);
  assert.equal(policy.check('https://claude.ai/', 'media', { mediaType: 'audio' }), false);
  assert.equal(policy.check(url, 'clipboard-read'), false);
  assert.equal(policy.check(url, 'clipboard-sanitized-write'), true);
  assert.equal(policy.canRequest('https://evil.example/', 'media'), false);
  assert.equal(policy.canRequest(url, 'display-capture'), false);
});
suite.test('Only exact HTTPS provider and auth origins are accepted', () => {
  assert.equal(isAllowedWebURL('https://chatgpt.com/c/123'), true);
  assert.equal(isAllowedWebURL('https://accounts.google.com/login', true), true);
  for (const url of ['https://evil.example/?next=accounts.google.com', 'https://chatgpt.com.evil.example/', 'http://chatgpt.com/', 'https://user:pass@chatgpt.com/', 'https://chatgpt.com:444/', 'javascript:alert(1)', 'file:///C:/Windows/notepad.exe']) assert.equal(isAllowedWebURL(url, true), false, url);
  assert.equal(isExternalURL('file:///C:/Windows/notepad.exe'), false);
  assert.equal(isExternalURL('ms-settings:privacy'), false);
});
suite.test('IPC must come from the designated webContents and its main frame', () => {
  const frame = { url: 'https://chatgpt.com/' };
  const win = { isDestroyed: () => false, webContents: { mainFrame: frame } };
  assert.equal(isTrustedSender({ sender: win.webContents, senderFrame: frame }, win, isAllowedWebURL), true);
  assert.equal(isTrustedSender({ sender: {}, senderFrame: frame }, win, isAllowedWebURL), false);
  assert.equal(isTrustedSender({ sender: win.webContents, senderFrame: { ...frame } }, win, isAllowedWebURL), false);
});
suite.test('Shortcut aliases collide and malformed accelerators are rejected', () => {
  assert.equal(normalizeAccelerator('Ctrl+Enter'), normalizeAccelerator('Control+Return'));
  assert.throws(() => validateShortcuts({ ...DEFAULT_SETTINGS.shortcuts, emergencyExit: 'Ctrl+S' }), /conflict/);
  assert.throws(() => normalizeAccelerator('S'));
  assert.throws(() => normalizeAccelerator('Ctrl+Bogus'));
  assert.doesNotThrow(() => validateShortcuts(DEFAULT_SETTINGS.shortcuts));
});
suite.test('Nonzero exit, ten failures, missing result, signal and timeout always fail', () => {
  const success = 'GLANCE_TEST_RESULT {"passed":3,"failed":0}\n';
  assert.equal(evaluateResult(0, null, false, success), true);
  assert.equal(evaluateResult(1, null, false, success), false);
  assert.equal(evaluateResult(1, null, false, '0 passed, 10 failed'), false);
  assert.equal(evaluateResult(0, null, false, '0 failed'), false);
  assert.equal(evaluateResult(0, 'SIGTERM', false, success), false);
  assert.equal(evaluateResult(0, null, true, success), false);
  assert.equal(evaluateResult(0, null, false, success, 'FAIL: assertion'), false);
});
app.whenReady().then(async () => app.exit(await suite.run() ? 0 : 1));
