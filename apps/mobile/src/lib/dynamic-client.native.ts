import {
  createDynamicClient,
  initializeClient,
  logout,
} from '@dynamic-labs-sdk/client';
import {
  createWaasWalletAccounts,
  getChainsMissingWaasWalletAccounts,
} from '@dynamic-labs-sdk/client/waas';
import { addWaasEvmExtension } from '@dynamic-labs-sdk/evm/waas';
import { addWaasSolanaExtension } from '@dynamic-labs-sdk/solana/waas';

const VAD_DYNAMIC_SANDBOX_ENVIRONMENT_ID = 'b7adb778-e5f7-4f7c-952d-a7daa651c030';

const environmentId =
  process.env.EXPO_PUBLIC_DYNAMIC_ENVIRONMENT_ID?.trim()
  || VAD_DYNAMIC_SANDBOX_ENVIRONMENT_ID;

export const dynamicWalletConfiguration = {
  environmentId,
  ready: environmentId.length > 0,
} as const;

export const dynamicClient = dynamicWalletConfiguration.ready
  ? createDynamicClient({ environmentId })
  : null;

let initialization: Promise<void> | null = null;

export function initializeDynamicWalletClient() {
  if (!dynamicClient) {
    return Promise.reject(new Error('Dynamic wallet environment is not configured.'));
  }

  if (!initialization) {
    addWaasEvmExtension(dynamicClient);
    addWaasSolanaExtension(dynamicClient);
    initialization = initializeClient(dynamicClient);
  }

  return initialization;
}

export async function clearDynamicWalletSession() {
  if (!dynamicClient) return;
  await logout(dynamicClient);
}

export async function ensureDynamicEmbeddedWallets() {
  if (!dynamicClient) {
    throw new Error('Dynamic wallet environment is not configured.');
  }

  await initializeDynamicWalletClient();
  const missingChains = getChainsMissingWaasWalletAccounts(dynamicClient);
  if (missingChains.length) {
    await createWaasWalletAccounts({ chains: missingChains }, dynamicClient);
  }
}
