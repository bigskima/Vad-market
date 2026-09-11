import 'expo-sqlite/localStorage/install';

export async function getProductLocalItem(key: string) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export async function setProductLocalItem(key: string, value: string) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Preview persistence must never block the product experience.
  }
}
