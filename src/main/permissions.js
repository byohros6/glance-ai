import { isAllowedWebURL } from './security.js';

// Grants last for this app session and are scoped to an exact provider origin.
export function createPermissionPolicy() {
  const grants = new Set();
  const prompted = new Set(['media', 'notifications', 'clipboard-read', 'fullscreen']);
  const originOf = url => { try { return new URL(url).origin; } catch { return ''; } };
  const key = (url, permission, type = '') => `${originOf(url)}|${permission}|${type}`;
  return {
    canRequest: (url, permission) => isAllowedWebURL(url) && prompted.has(permission),
    check(url, permission, details = {}) {
      if (!isAllowedWebURL(url)) return false;
      if (permission === 'clipboard-sanitized-write') return true;
      if (permission === 'media') {
        const type = details.mediaType;
        return ['audio', 'video'].includes(type) && grants.has(key(url, permission, type));
      }
      return grants.has(key(url, permission));
    },
    grant(url, permission, details = {}) {
      if (!this.canRequest(url, permission)) return;
      if (permission === 'media') {
        for (const type of details.mediaTypes || []) {
          if (['audio', 'video'].includes(type)) grants.add(key(url, permission, type));
        }
      } else grants.add(key(url, permission));
    }
  };
}
