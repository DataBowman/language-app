import type { SecureSession } from './types';

// The browser has no keychain. localStorage is readable by any script on the page, which is why the
// web build ships a strict Content-Security-Policy and no third-party scripts (ADR 0006).
const store = () => (typeof window === 'undefined' ? null : window.localStorage);

export const secureSession: SecureSession = {
  async getItem(key) {
    return store()?.getItem(key) ?? null;
  },
  async setItem(key, value) {
    store()?.setItem(key, value);
  },
  async removeItem(key) {
    store()?.removeItem(key);
  },
};
