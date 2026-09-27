import * as SecureStore from 'expo-secure-store';

import type { SecureSession } from './types';

// Keychain/Keystore values should stay small (~2 KB), and a Supabase session is larger,
// so values are split across numbered chunk keys with a count stored under the base key.
const CHUNK = 1800;
const countKey = (key: string) => `${key}.n`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;
// SecureStore keys may only contain alphanumerics, '.', '-' and '_'.
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

async function remove(key: string): Promise<void> {
  const n = Number((await SecureStore.getItemAsync(countKey(key))) ?? 0);
  for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
  await SecureStore.deleteItemAsync(countKey(key));
}

export const secureSession: SecureSession = {
  async getItem(rawKey) {
    const key = safe(rawKey);
    const n = Number((await SecureStore.getItemAsync(countKey(key))) ?? 0);
    if (n === 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part === null) return null; // partially written: treat as signed out rather than corrupt
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(rawKey, value) {
    const key = safe(rawKey);
    await remove(key);
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(countKey(key), String(n)); // written last: marks the value complete
  },
  async removeItem(rawKey) {
    await remove(safe(rawKey));
  },
};
