import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { claimGrowthCode } from '@/services/growth-api';
import { supabase } from '@/lib/supabase';

const PENDING_GROWTH_CODE_KEY = 'vad:growth:pending-code';
const MAX_PENDING_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type PendingGrowthCode = {
  code: string;
  savedAt: number;
};

async function readStorageValue() {
  if (Platform.OS === 'web' && typeof globalThis.localStorage !== 'undefined') {
    try {
      return globalThis.localStorage.getItem(PENDING_GROWTH_CODE_KEY);
    } catch {
      // Continue to the platform storage fallback if browser storage is blocked.
    }
  }

  return AsyncStorage.getItem(PENDING_GROWTH_CODE_KEY);
}

async function writeStorageValue(value: string) {
  if (Platform.OS === 'web' && typeof globalThis.localStorage !== 'undefined') {
    try {
      globalThis.localStorage.setItem(PENDING_GROWTH_CODE_KEY, value);
      return;
    } catch {
      // Continue to the platform storage fallback if browser storage is blocked.
    }
  }

  await AsyncStorage.setItem(PENDING_GROWTH_CODE_KEY, value);
}

export async function rememberPendingGrowthCode(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return;

  const payload: PendingGrowthCode = { code: normalized, savedAt: Date.now() };
  try {
    await writeStorageValue(JSON.stringify(payload));
  } catch {
    // The landing flow remains usable even if this device does not persist local state.
  }
}

export async function readPendingGrowthCode() {
  try {
    const raw = await readStorageValue();
    if (!raw) return null;

    const value = JSON.parse(raw) as Partial<PendingGrowthCode>;
    if (typeof value.code !== 'string' || typeof value.savedAt !== 'number') {
      await clearPendingGrowthCode();
      return null;
    }
    if (Date.now() - value.savedAt > MAX_PENDING_AGE_MS) {
      await clearPendingGrowthCode();
      return null;
    }
    return value.code.trim().toUpperCase() || null;
  } catch {
    await clearPendingGrowthCode();
    return null;
  }
}

export async function clearPendingGrowthCode() {
  try {
    if (Platform.OS === 'web' && typeof globalThis.localStorage !== 'undefined') {
      try {
        globalThis.localStorage.removeItem(PENDING_GROWTH_CODE_KEY);
        return;
      } catch {
        // Continue to the platform storage fallback if browser storage is blocked.
      }
    }
    await AsyncStorage.removeItem(PENDING_GROWTH_CODE_KEY);
  } catch {
    // Nothing else is required.
  }
}

export async function applyPendingGrowthCode() {
  const code = await readPendingGrowthCode();
  if (!code) return null;

  try {
    const result = await claimGrowthCode(code);
    await clearPendingGrowthCode();
    return result;
  } catch {
    // A signed-in account can only have one acquisition source. We make one
    // background attempt and then clear the pending code so failed/expired
    // campaigns never create a retry loop on every screen render.
    await clearPendingGrowthCode();
    return null;
  }
}

export async function hasGrowthAttribution() {
  const { data, error } = await supabase.rpc('my_growth_dashboard');
  if (error) return false;
  return Boolean((data as { attribution?: unknown } | null)?.attribution);
}
