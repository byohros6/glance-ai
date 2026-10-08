export const RELEASES_URL = 'https://github.com/byohros6/glance-ai/releases';
const API_URL = 'https://api.github.com/repos/byohros6/glance-ai/releases/latest';

function versionParts(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) return null;
  const parts = value.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}
export function isNewerVersion(candidate, current) {
  const next = versionParts(candidate), installed = versionParts(current);
  if (!next || !installed) return false;
  for (let index = 0; index < 3; index++) {
    if (next[index] !== installed[index]) return next[index] > installed[index];
  }
  return false;
}
export function releaseUpdate(release, currentVersion, portable = false) {
  if (!release || release.draft !== false || release.prerelease !== false || typeof release.tag_name !== 'string' || !release.tag_name.startsWith('v')) throw new Error('Invalid stable release');
  const version = release.tag_name.slice(1);
  if (!versionParts(version)) throw new Error('Invalid release version');
  if (!isNewerVersion(version, currentVersion)) return { status: 'current', currentVersion };
  const pageURL = `${RELEASES_URL}/tag/v${version}`;
  const filename = `Glance-AI-${portable ? 'Portable' : 'Setup'}-${version}.exe`;
  const downloadURL = `${RELEASES_URL}/download/v${version}/${filename}`;
  const asset = Array.isArray(release.assets) && release.assets.find(item => item.name === filename && item.browser_download_url === downloadURL && item.state === 'uploaded' && item.size > 0);
  // Construct URLs from the fixed repository; never open a URL supplied by release notes.
  return { status: 'available', currentVersion, version, url: asset ? downloadURL : pageURL, directDownload: Boolean(asset), portable };
}
export function createUpdateChecker({ currentVersion, portable = false, fetchRelease = globalThis.fetch, now = Date.now, cooldown = 60000 }) {
  let state = { status: 'idle', currentVersion }, pending = null, checkedAt = null;
  return {
    getState: () => ({ ...state }),
    check() {
      if (pending) return pending;
      if (checkedAt !== null && now() - checkedAt < cooldown) return Promise.resolve({ ...state });
      pending = (async () => {
        await Promise.resolve(); // Set pending before even a synchronous transport failure.
        try {
          const response = await fetchRelease(API_URL, {
            headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Glance-AI/${currentVersion}` },
            signal: AbortSignal.timeout(10000), redirect: 'error'
          });
          if (!response.ok) throw new Error('Release service unavailable');
          const body = await response.text();
          if (body.length > 1024 * 1024) throw new Error('Release response too large');
          state = releaseUpdate(JSON.parse(body), currentVersion, portable);
        } catch {
          state = { status: 'unavailable', currentVersion, message: 'Could not check for updates. Try again later or open GitHub releases.' };
        } finally { checkedAt = now(); pending = null; }
        return { ...state };
      })();
      return pending;
    }
  };
}
