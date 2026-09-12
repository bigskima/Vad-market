import { claimGrowthCode } from '@/services/growth-api';
import { supabase } from '@/lib/supabase';

const PENDING_GROWTH_CODE_KEY = 'vad:growth:pending-code';
const MAX_PENDING_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type PendingGrowthCode = {
  code: string;
  savedAt: number;
};

export function rememberPendingGrowthCode(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return;
  const payload: PendingGrowthCode = { code: normalized, savedAt: Date.now() };
  try {
    globalThis.localStorage?.setItem(PENDING_GROWTH_CODE_KEY, JSON.stringify(payload));
  } catch {
    // The landing flow remains usable even if this device does not persist local state.
  }
}

export function readPendingGrowthCode() {
  try {
    const raw = globalThis.localStorage?.getItem(PENDING_GROWTH_CODE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingGrowthCode>;
    if (typeof value.code !== 'string' || typeof value.savedAt !== 'number') {
      clearPendingGrowthCode();
      return null;
    }
    if (Date.now() - value.savedAt > MAX_PENDING_AGE_MS) {
      clearPendingGrowthCode();
      return null;
    }
    return value.code.trim().toUpperCase() || null;
  } catch {
    clearPendingGrowthCode();
    return null;
  }
}

export function clearPendingGrowthCode() {
  try {
    globalThis.localStorage?.removeItem(PENDING_GROWTH_CODE_KEY);
  } catch {
    // Nothing else is required.
  }
}

export async function applyPendingGrowthCode() {
  const code = readPendingGrowthCode();
  if (!code) return null;

  try {
    const result = await claimGrowthCode(code);
    clearPendingGrowthCode();
    return result;
  } catch {
    // A signed-in account can only have one acquisition source. We make one
    // background attempt and then clear the pending code so failed/expired
    // campaigns never create a retry loop on every screen render.
    clearPendingGrowthCode();
    return null;
  }
}

export async function hasGrowthAttribution() {
  const { data, error } = await supabase.rpc('my_growth_dashboard');
  if (error) return false;
  return Boolean((data as { attribution?: unknown } | null)?.attribution);
}
