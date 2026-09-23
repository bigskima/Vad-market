import {
  createWalletSession,
  type KnownChainFamily,
  type WalletSession,
} from '@vad/chain-core';

export const DYNAMIC_EMBEDDED_PROVIDER_KEY = 'DYNAMIC_EMBEDDED';

export type DynamicEmbeddedWalletSession = WalletSession & {
  providerKey: typeof DYNAMIC_EMBEDDED_PROVIDER_KEY;
  providerMode: 'EMBEDDED';
  custodyModel: 'SELF_CUSTODY';
};

export function dynamicWalletAccountToSession(value: unknown): DynamicEmbeddedWalletSession | null {
  if (!value || typeof value !== 'object') return null;

  const row = value as Record<string, unknown>;
  const address = readString(row.address) || readString(row.publicKey);
  const chainFamily = resolveChainFamily(row);

  if (!address || !chainFamily) return null;

  return createWalletSession({
    chainFamily,
    address,
    providerKey: DYNAMIC_EMBEDDED_PROVIDER_KEY,
    providerMode: 'EMBEDDED',
    custodyModel: 'SELF_CUSTODY',
  }) as DynamicEmbeddedWalletSession;
}

export function dynamicWalletAccountsToSessions(values: readonly unknown[]) {
  const sessions: DynamicEmbeddedWalletSession[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const session = dynamicWalletAccountToSession(value);
    if (!session) continue;

    const key = `${session.chainFamily}:${session.address.toLowerCase()}`;
    if (seen.has(key)) continue;

    seen.add(key);
    sessions.push(session);
  }

  return sessions;
}

function resolveChainFamily(row: Record<string, unknown>): KnownChainFamily | null {
  const candidates = [
    readString(row.chain),
    readString(row.chainName),
    readString(row.chainFamily),
    readString(row.network),
    readNestedString(row, 'chain', 'name'),
    readNestedString(row, 'network', 'name'),
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  if (!candidates) return null;

  if (
    candidates.includes('SOLANA')
    || candidates.includes('SOL')
    || candidates.includes('SVM')
  ) {
    return 'SOLANA';
  }

  if (
    candidates.includes('EVM')
    || candidates.includes('ETH')
    || candidates.includes('BASE')
    || candidates.includes('POLYGON')
    || candidates.includes('BINANCE')
    || candidates.includes('BNB')
    || candidates.includes('ARC')
    || candidates.includes('SEPOLIA')
  ) {
    return 'EVM';
  }

  return null;
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readNestedString(
  row: Record<string, unknown>,
  key: string,
  nestedKey: string,
) {
  const nested = row[key];
  if (!nested || typeof nested !== 'object') return '';
  return readString((nested as Record<string, unknown>)[nestedKey]);
}
