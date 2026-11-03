import { app } from 'electron';
import { buildChromeUserAgent, buildUserAgentMetadata, chromeMajor, createDebuggerIdentity, createIdentityHeaderRewriter, formatBrandList } from '../../src/main/chrome-identity.js';
import { isAuthHost } from '../../src/main/security.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';
const suite = createTestSuite('Gemini Chrome identity and auth-host classification');
const VERSION = '134.0.6998.205';

function mockContents({ attached = false, destroyed = false, hang = false, failAttach = false } = {}) {
  const calls = { attach: 0, detach: 0, commands: [] };
  const state = { attached, destroyed };
  return {
    calls, state,
    isDestroyed: () => state.destroyed,
    debugger: {
      isAttached: () => state.attached,
      attach() { calls.attach++; if (failAttach) throw new Error('attach failed'); state.attached = true; },
      detach() { calls.detach++; state.attached = false; },
      sendCommand(method, params) { calls.commands.push({ method, params }); return hang ? new Promise(() => {}) : Promise.resolve({}); }
    }
  };
}

suite.test('User agent has a Chrome token from the running major version and no Electron token', () => {
  const ua = buildChromeUserAgent(VERSION);
  assert.equal(ua, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36');
  assert.ok(!/electron/i.test(ua));
  assert.equal(chromeMajor('99.1.2.3'), 99);
  assert.throws(() => chromeMajor('abc'), TypeError);
});
suite.test('User-agent metadata exposes Google Chrome brands, full version list and Windows platform', () => {
  const meta = buildUserAgentMetadata(VERSION);
  assert.deepEqual(meta.brands.map(b => b.brand), ['Google Chrome', 'Chromium', 'Not)A;Brand']);
  assert.equal(meta.brands[0].version, '134');
  assert.equal(meta.fullVersionList[0].version, VERSION);
  assert.equal(meta.fullVersion, VERSION);
  assert.equal(meta.platform, 'Windows');
  assert.equal(meta.mobile, false);
  assert.ok(!meta.brands.concat(meta.fullVersionList).some(b => /electron/i.test(b.brand)));
});
suite.test('formatBrandList produces structured-header syntax', () => {
  assert.equal(formatBrandList([{ brand: 'Google Chrome', version: '134' }, { brand: 'Chromium', version: '134' }]), '"Google Chrome";v="134", "Chromium";v="134"');
  assert.equal(formatBrandList([]), '');
});
suite.test('Header rewriter replaces identity headers case-insensitively and preserves others', () => {
  const rewrite = createIdentityHeaderRewriter(VERSION);
  const headers = rewrite({ 'user-agent': 'Safari', 'Sec-CH-UA': 'x', 'SEC-CH-UA-MOBILE': '?1', 'sec-ch-ua-platform': '"Mac"', Accept: 'text/html', Cookie: 'a=b' });
  assert.equal(Object.keys(headers).filter(k => k.toLowerCase() === 'user-agent').length, 1);
  assert.equal(headers['User-Agent'], buildChromeUserAgent(VERSION));
  assert.match(headers['sec-ch-ua'], /"Google Chrome";v="134"/);
  assert.equal(headers['sec-ch-ua-mobile'], '?0');
  assert.equal(headers['sec-ch-ua-platform'], '"Windows"');
  assert.equal(Object.keys(headers).filter(k => k.toLowerCase().startsWith('sec-ch-ua')).length, 3);
  assert.equal(headers.Accept, 'text/html');
  assert.equal(headers.Cookie, 'a=b');
});
suite.test('Full version list is added only when the request asked for it', () => {
  const rewrite = createIdentityHeaderRewriter(VERSION);
  assert.equal('sec-ch-ua-full-version-list' in rewrite({ 'User-Agent': 'x' }), false);
  const headers = rewrite({ 'Sec-CH-UA-Full-Version-List': '"Old";v="1"' });
  assert.equal(Object.keys(headers).filter(k => k.toLowerCase() === 'sec-ch-ua-full-version-list').length, 1);
  assert.ok(headers['sec-ch-ua-full-version-list'].includes(`"Google Chrome";v="${VERSION}"`));
});
suite.test('Debugger identity attaches, sends the override, and detaches idempotently', async () => {
  const contents = mockContents();
  const identity = createDebuggerIdentity(VERSION, () => {});
  assert.equal(await identity.attach(contents), true);
  assert.equal(identity.attached, true);
  assert.equal(contents.calls.commands[0].method, 'Emulation.setUserAgentOverride');
  assert.equal(contents.calls.commands[0].params.userAgent, buildChromeUserAgent(VERSION));
  assert.equal(await identity.attach(contents), true);
  assert.equal(contents.calls.attach, 1);
  identity.detach(); identity.detach();
  assert.equal(contents.calls.detach, 1);
  assert.equal(identity.attached, false);
});
suite.test('Debugger identity never detaches a debugger it did not attach', async () => {
  const contents = mockContents({ attached: true });
  const warnings = [];
  const identity = createDebuggerIdentity(VERSION, message => warnings.push(message));
  assert.equal(await identity.attach(contents), false);
  assert.equal(warnings.length, 1);
  assert.equal(contents.calls.attach, 0);
  identity.detach();
  assert.equal(contents.calls.detach, 0);
  assert.equal(contents.state.attached, true);
  assert.equal(await createDebuggerIdentity(VERSION, () => {}).attach(mockContents({ destroyed: true })), false);
});
suite.test('Debugger command timeout returns false, warns, and detaches', async () => {
  const contents = mockContents({ hang: true });
  const warnings = [];
  const identity = createDebuggerIdentity(VERSION, message => warnings.push(message));
  assert.equal(await identity.attach(contents), false);
  assert.equal(contents.calls.detach, 1);
  assert.equal(contents.state.attached, false);
  assert.equal(identity.attached, false);
  assert.equal(warnings.length, 1);
});
suite.test('A failed attach does not detach anything', async () => {
  const contents = mockContents({ failAttach: true });
  const identity = createDebuggerIdentity(VERSION, () => {});
  assert.equal(await identity.attach(contents), false);
  assert.equal(contents.calls.detach, 0);
});
suite.test('isAuthHost matches exact auth hostnames only', () => {
  for (const url of ['https://accounts.google.com/signin', 'https://www.google.com/', 'https://appleid.apple.com/', 'https://auth.openai.com/x']) assert.equal(isAuthHost(url), true, url);
  for (const url of ['https://gemini.google.com/app', 'https://chatgpt.com/', 'https://accounts.google.com.evil.example/', 'https://evil.example/accounts.google.com', 'not a url', '', undefined]) assert.equal(isAuthHost(url), false, String(url));
});
app.whenReady().then(async () => app.exit(await suite.run() ? 0 : 1));
