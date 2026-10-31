// Single source of truth for the Gemini provider's Chrome identity:
// navigator.userAgent, navigator.userAgentData and the sec-ch-ua* request headers.
// Versions come from the running Chromium (process.versions.chrome). Header values are never logged.

export function chromeMajor(chromeVersion) {
  const major = Number.parseInt(String(chromeVersion).split('.')[0], 10);
  if (!Number.isInteger(major) || major < 1) throw new TypeError('Invalid Chrome version');
  return major;
}

export function buildChromeUserAgent(chromeVersion) {
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor(chromeVersion)}.0.0.0 Safari/537.36`;
}

export function buildUserAgentMetadata(chromeVersion) {
  const major = String(chromeMajor(chromeVersion));
  const full = String(chromeVersion);
  return {
    brands: [
      { brand: 'Google Chrome', version: major },
      { brand: 'Chromium', version: major },
      { brand: 'Not)A;Brand', version: '24' }
    ],
    fullVersionList: [
      { brand: 'Google Chrome', version: full },
      { brand: 'Chromium', version: full },
      { brand: 'Not)A;Brand', version: '24.0.0.0' }
    ],
    fullVersion: full,
    platform: 'Windows',
    platformVersion: '15.0.0',
    architecture: 'x86',
    model: '',
    mobile: false,
    bitness: '64',
    wow64: false
  };
}

export function formatBrandList(list) {
  return list.map(({ brand, version }) => `"${brand}";v="${version}"`).join(', ');
}

/** Returns a function that rewrites a request header object in place to the Chrome identity. */
export function createIdentityHeaderRewriter(chromeVersion) {
  const metadata = buildUserAgentMetadata(chromeVersion);
  const userAgent = buildChromeUserAgent(chromeVersion);
  const secChUa = formatBrandList(metadata.brands);
  const fullList = formatBrandList(metadata.fullVersionList);
  const secChPlatform = `"${metadata.platform}"`;
  const secChMobile = metadata.mobile ? '?1' : '?0';
  return headers => {
    let hadFullList = false;
    for (const name of Object.keys(headers)) {
      const lower = name.toLowerCase();
      if (lower === 'sec-ch-ua-full-version-list') hadFullList = true;
      if (lower === 'user-agent' || lower === 'sec-ch-ua' || lower === 'sec-ch-ua-mobile' || lower === 'sec-ch-ua-platform' || lower === 'sec-ch-ua-full-version-list') delete headers[name];
    }
    headers['User-Agent'] = userAgent;
    headers['sec-ch-ua'] = secChUa;
    headers['sec-ch-ua-mobile'] = secChMobile;
    headers['sec-ch-ua-platform'] = secChPlatform;
    if (hadFullList) headers['sec-ch-ua-full-version-list'] = fullList;
    return headers;
  };
}

/**
 * Manages the CDP user-agent override for one webContents. Never touches a debugger it did not attach.
 * attach() resolves true when the override is active, false when falling back to header-only identity.
 */
const COMMAND_TIMEOUT_MS = 1500;

export function createDebuggerIdentity(chromeVersion, warn = message => console.warn(message)) {
  let owned = null;
  const override = () => ({ userAgent: buildChromeUserAgent(chromeVersion), platform: 'Win32', userAgentMetadata: buildUserAgentMetadata(chromeVersion) });
  async function attach(contents) {
    if (!contents || contents.isDestroyed()) return false;
    if (owned === contents) return true;
    detach();
    const dbg = contents.debugger;
    try {
      if (dbg.isAttached()) { warn('Gemini identity: debugger already attached; using header-only identity.'); return false; }
      dbg.attach('1.3');
      owned = contents;
      // A fresh webContents with no committed page may never answer; never block the load on it.
      let timer;
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), COMMAND_TIMEOUT_MS); });
      try { await Promise.race([dbg.sendCommand('Emulation.setUserAgentOverride', override()), timeout]); }
      finally { clearTimeout(timer); }
      return true;
    } catch {
      detach();
      warn('Gemini identity: debugger override unavailable; using header-only identity.');
      return false;
    }
  }
  function detach() {
    const contents = owned;
    owned = null;
    if (!contents || contents.isDestroyed()) return;
    try { if (contents.debugger.isAttached()) contents.debugger.detach(); } catch { /* already detached */ }
  }
  return { attach, detach, get attached() { return owned !== null; } };
}
