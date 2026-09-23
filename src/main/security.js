export const PROVIDER_URLS = Object.freeze({
  gemini: 'https://gemini.google.com/app',
  chatgpt: 'https://chatgpt.com/',
  claude: 'https://claude.ai/',
  perplexity: 'https://www.perplexity.ai/'
});

const providerHosts = new Set(['gemini.google.com', 'chatgpt.com', 'chat.openai.com', 'claude.ai', 'www.perplexity.ai', 'perplexity.ai']);
const authHosts = new Set(['accounts.google.com', 'accounts.youtube.com', 'auth.openai.com', 'auth0.openai.com', 'auth.anthropic.com', 'accounts.anthropic.com', 'appleid.apple.com', 'login.microsoftonline.com', 'login.live.com']);

export function isAllowedWebURL(value, includeAuth = false) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (!url.port || url.port === '443') &&
      (providerHosts.has(url.hostname) || (includeAuth && authHosts.has(url.hostname)));
  } catch { return false; }
}

export function isExternalURL(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function isTrustedSender(event, win, allowedURL) {
  if (!win || win.isDestroyed() || event.sender !== win.webContents) return false;
  const frame = event.senderFrame;
  return !!frame && frame === win.webContents.mainFrame && allowedURL(frame.url);
}

export function requireBoolean(value) {
  if (typeof value !== 'boolean') throw new TypeError('Expected a boolean');
  return value;
}
