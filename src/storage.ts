import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

/**
 * Local storage. JSON files live in the app's private Documents folder, which
 * iOS encrypts with Data Protection while the phone is locked. Secrets (API key)
 * go to the iOS Keychain via SecureStore and are never written to files or logs.
 */
export async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const f = new File(Paths.document, name);
    if (!f.exists) return fallback;
    return { ...fallback, ...JSON.parse(await f.text()) } as T;
  } catch {
    return fallback;
  }
}

export async function readJsonArray<T>(name: string): Promise<T[]> {
  try {
    const f = new File(Paths.document, name);
    return f.exists ? (JSON.parse(await f.text()) as T[]) : [];
  } catch {
    return [];
  }
}

export async function writeJson(name: string, value: unknown) {
  const f = new File(Paths.document, name);
  if (!f.exists) f.create();
  await f.write(JSON.stringify(value));
}

export function deleteFile(name: string) {
  const f = new File(Paths.document, name);
  if (f.exists) f.delete();
}

export const secret = {
  get: (k: string) => SecureStore.getItemAsync(k),
  set: (k: string, v: string) => SecureStore.setItemAsync(k, v, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  del: (k: string) => SecureStore.deleteItemAsync(k),
};
