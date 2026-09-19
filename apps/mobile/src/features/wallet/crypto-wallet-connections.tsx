import { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  browserWalletAvailability,
  connectAndVerifyBrowserWallet,
} from '@/services/browser-wallet-adapter';
import {
  getMyWalletConnections,
  revokeWalletConnection,
  type WalletChainFamily,
  type WalletConnection,
} from '@/services/wallet-api';

export function CryptoWalletConnections() {
  const theme = useVadTheme();
  const [wallets, setWallets] = useState<WalletConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<WalletChainFamily | 'REVOKE' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await getMyWalletConnections();
      setWallets(next);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Connected wallets could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const connect = useCallback(async (family: WalletChainFamily) => {
    if (working) return;
    setWorking(family);
    setError(null);

    try {
      await connectAndVerifyBrowserWallet(family);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The wallet could not be connected.');
    } finally {
      setWorking(null);
    }
  }, [load, working]);

  const revoke = useCallback(async (walletId: string) => {
    if (working) return;
    setWorking('REVOKE');
    setError(null);

    try {
      await revokeWalletConnection(walletId);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The wallet could not be disconnected.');
    } finally {
      setWorking(null);
    }
  }, [load, working]);

  const active = wallets.filter((wallet) => wallet.status === 'VERIFIED');
  const availability = browserWalletAvailability();
  const web = Platform.OS === 'web';

  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 3 }}>
        <VadText variant="caption" tone="brand">SELF-CUSTODY CRYPTO</VadText>
        <VadText variant="heading">External wallets</VadText>
        <VadText variant="caption" tone="secondary">
          VAD stores only a verified public wallet address. Your private keys and seed phrase remain inside your wallet.
        </VadText>
      </View>

      {loading ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadSkeleton height={62} radius={theme.radius.lg} />
        </View>
      ) : active.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          {active.map((wallet) => (
            <VadCard key={wallet.wallet_id} variant="muted" style={{ gap: theme.spacing.xs }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <VadText variant="bodyStrong">{wallet.wallet_provider || wallet.chain_family}</VadText>
                  <VadText variant="caption" tone="tertiary" numberOfLines={1}>
                    {shortAddress(wallet.wallet_address)}
                  </VadText>
                </View>
                <VadChip label={wallet.chain_family} tone="brand" />
                <VadChip label="VERIFIED" tone="yes" />
              </View>
              <VadButton
                label="Disconnect"
                variant="secondary"
                size="small"
                fullWidth={false}
                loading={working === 'REVOKE'}
                disabled={Boolean(working)}
                onPress={() => void revoke(wallet.wallet_id)}
              />
            </VadCard>
          ))}
        </View>
      ) : (
        <VadText variant="caption" tone="tertiary">
          No external wallet is verified for this VAD account yet.
        </VadText>
      )}

      {web ? (
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
            <VadButton
              label={availability.evm ? 'Connect EVM wallet' : 'Connect EVM wallet'}
              variant="secondary"
              loading={working === 'EVM'}
              disabled={Boolean(working)}
              onPress={() => void connect('EVM')}
              style={{ flexGrow: 1 }}
            />
            <VadButton
              label={availability.solana ? 'Connect Solana wallet' : 'Connect Solana wallet'}
              variant="secondary"
              loading={working === 'SOLANA'}
              disabled={Boolean(working)}
              onPress={() => void connect('SOLANA')}
              style={{ flexGrow: 1 }}
            />
          </View>
          {!availability.evm && !availability.solana ? (
            <VadText variant="caption" tone="tertiary">
              Install or enable a compatible browser wallet, then connect it here.
            </VadText>
          ) : null}
        </View>
      ) : (
        <VadCard variant="muted">
          <VadText variant="caption" tone="secondary">
            Native mobile wallet connection is kept separate from VAD&apos;s NGN wallet and will use the mobile wallet adapter. Browser wallet verification is already available on VAD web.
          </VadText>
        </VadCard>
      )}

      {error ? <VadErrorState title="Wallet connection needs attention" message={error} onRetry={() => void load()} /> : null}
    </VadCard>
  );
}

function shortAddress(address: string) {
  if (address.length <= 18) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}
