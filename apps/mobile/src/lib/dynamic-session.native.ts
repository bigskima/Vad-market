import { clearDynamicWalletSession } from '@/lib/dynamic-client.native';

export async function clearDynamicWalletSessionSafe() {
  try {
    await clearDynamicWalletSession();
  } catch {
    // VAD sign-out must continue even if Dynamic is temporarily unavailable.
  }
}
