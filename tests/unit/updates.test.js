import { app } from 'electron';
import { createUpdateChecker, isNewerVersion, releaseUpdate, RELEASES_URL } from '../../src/main/updates.js';
import { createTestSuite, assert } from '../helpers/test_suite.js';
const suite = createTestSuite('Update discovery and safe release links');
function release(version = '1.2.10') { return {tag_name: `v${version}`, draft: false, prerelease: false, assets: []}; }
suite.test('Compares numeric stable versions without downgrade or prerelease prompts', () => {
  assert.equal(isNewerVersion('1.2.10', '1.2.9'), true);
  assert.equal(isNewerVersion('1.3.0', '1.2.9'), true);
  for (const version of ['1.2.9', '1.2.8', '1.2.10-beta', '01.3.0', 'bad']) assert.equal(isNewerVersion(version, '1.2.9'), false);
  assert.equal(releaseUpdate(release('1.2.8'), '1.2.9').status, 'current');
  assert.throws(() => releaseUpdate({...release(), prerelease: true}, '1.2.9'));
  assert.throws(() => releaseUpdate({...release(), draft: true}, '1.2.9'));
});
suite.test('Selects installer or portable assets and never trusts arbitrary release URLs', () => {
  const next = release();
  next.html_url = 'https://evil.example';
  for (const kind of ['Setup', 'Portable']) next.assets.push({name: `Glance-AI-${kind}-1.2.10.exe`, state: 'uploaded', size: 100, browser_download_url: `${RELEASES_URL}/download/v1.2.10/Glance-AI-${kind}-1.2.10.exe`});
  assert.ok(releaseUpdate(next, '1.2.9').url.endsWith('Setup-1.2.10.exe'));
  assert.ok(releaseUpdate(next, '1.2.9', true).url.endsWith('Portable-1.2.10.exe'));
  next.assets[0].browser_download_url = 'https://evil.example/update.exe';
  assert.equal(releaseUpdate(next, '1.2.9').url, `${RELEASES_URL}/tag/v1.2.10`);
  assert.throws(() => releaseUpdate(release('../other'), '1.2.9'));
});
suite.test('Coalesces requests, throttles repeated checks and retries failures', async () => {
  let requests = 0, clock = 0, fail = false;
  const checker = createUpdateChecker({currentVersion: '1.2.9', now: () => clock, fetchRelease: async (_url, options) => {
    requests++;
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    if (fail) throw new Error('offline');
    return {ok: true, text: async () => JSON.stringify(release())};
  }});
  const first = checker.check();
  assert.equal(checker.check(), first);
  assert.equal((await first).status, 'available');
  await checker.check(); assert.equal(requests, 1);
  clock = 60001; fail = true;
  assert.equal((await checker.check()).status, 'unavailable');
  clock += 60001; fail = false;
  assert.equal((await checker.check()).status, 'available');
  assert.equal(requests, 3);
});
suite.test('Offline, rate-limited and malformed responses never claim up to date', async () => {
  for (const fetchRelease of [() => {throw new Error('offline');}, async () => ({ok: false}), async () => ({ok: true, text: async () => 'invalid'})]) {
    const checker = createUpdateChecker({currentVersion: '1.2.9', cooldown: 0, fetchRelease});
    assert.equal((await checker.check()).status, 'unavailable');
    assert.equal((await checker.check()).status, 'unavailable');
  }
});
app.whenReady().then(async () => app.exit(await suite.run() ? 0 : 1));
