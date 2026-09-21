import {
  createDynamicClient,
  initializeClient,
  logout,
} from '@dynamic-labs-sdk/client';
import { addWaasEvmExtension } from '@dynamic-labs-sdk/evm/waas';
import { addWaasSolanaExtension } from '@dynamic-labs-sdk/solana/waas';

const environmentId = process.env.EXPO_PUBLIC_DYNAMIC_ENVIRONMENT_ID?.trim() ?? '';

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
    addWaasEvmExtension();
    addWaasSolanaExtension();
    initialization = initializeClient(dynamicClient);
  }

  return initialization;
}

export async function clearDynamicWalletSession() {
  if (!dynamicClient) return;
  await logout(dynamicClient);
}
