import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getMyUsdcNetworkBalances,
  type UsdcNetworkBalanceGroup,
} from '@/services/usdc-wallet-api';

export function UsdcWalletBalances() {
  const theme = useVadTheme();
  const [wallets, setWallets] = useState<string[]>([]);
  const [networks, setNetworks] = useState<UsdcNetworkBalanceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    setError(null);
    try {
      const result = await getMyUsdcNetworkBalances();
      setWallets(result.wallets);
      setNetworks(result.networks);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'On-chain balances are temporarily unavailable.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 3 }}>
        <VadText variant="caption" tone="brand">SELF-CUSTODY · USDC</VadText>
        <VadText variant="heading">On-chain balances</VadText>
        <VadText variant="caption" tone="secondary">
          Verified EVM wallet balances are read directly from each network. These funds are separate from your VAD ledger balance.
        </VadText>
      </View>

      {loading ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadSkeleton height={76} radius={theme.radius.lg} />
          <VadSkeleton height={76} radius={theme.radius.lg} />
        </View>
      ) : error && !networks.length ? (
        <VadErrorState
          title="USDC balances unavailable"
          message={error}
          onRetry={() => {
            setLoading(true);
            void load();
          }}
        />
      ) : !wallets.length ? (
        <VadEmptyState
          title="Verify an EVM wallet first"
          body="Set up your VAD wallet to view USDC balances on supported networks."
        />
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          {networks.map((network) => (
            <NetworkBalanceCard key={network.chainCode} network={network} />
          ))}
          {error ? (
            <VadText variant="caption" tone="tertiary">{error}</VadText>
          ) : null}
        </View>
      )}

      <VadButton
        label="Refresh on-chain balances"
        variant="secondary"
        loading={refreshing}
        disabled={loading || refreshing}
        onPress={() => void load(true)}
      />
    </VadCard>
  );
}

function NetworkBalanceCard({ network }: { network: UsdcNetworkBalanceGroup }) {
  const theme = useVadTheme();
  const readable = network.readStatus === 'OK';
  const hasBalanceResult = network.balances.some((balance) => balance.balance !== null);

  return (
    <VadCard variant="muted" style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="bodyStrong">{network.chainName}</VadText>
          <VadText variant="caption" tone="tertiary">Chain ID {network.chainId}</VadText>
        </View>
        <VadChip
          label={network.tradingReady ? 'TRADING READY' : 'READ ONLY'}
          tone={network.tradingReady ? 'yes' : 'warning'}
        />
      </View>

      {!readable ? (
        <VadText variant="caption" tone="secondary">
          {network.readStatus === 'NOT_CONFIGURED'
            ? 'Token or RPC configuration is incomplete.'
            : 'The network RPC did not respond. Your funds are not affected; try refreshing.'}
        </VadText>
      ) : hasBalanceResult ? (
        <View style={{ gap: theme.spacing.xs }}>
          {network.balances.filter((balance) => balance.balance !== null).map((balance) => (
            <View key={balance.walletAddress} style={{ gap: 3 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: theme.spacing.sm }}>
                <VadText variant="caption" tone="secondary">USDC balance</VadText>
                <VadText variant="bodyStrong">{formatUsdc(balance.balance ?? '0')} USDC</VadText>
              </View>
              <VadText variant="caption" tone="tertiary" numberOfLines={1}>
                {shortAddress(balance.walletAddress)}
              </VadText>
              <VadText variant="caption" tone={balance.gasReady ? 'secondary' : 'warning'}>
                {network.chainCode === 'ARC'
                  ? (balance.gasReady ? 'Native USDC gas balance detected' : 'No native USDC gas balance detected')
                  : (balance.gasReady ? `Gas balance: ${formatUsdc(balance.gasBalance ?? '0')} ${balance.gasSymbol}` : `No ${balance.gasSymbol} gas balance detected`)}
              </VadText>
            </View>
          ))}
          {!network.tradingReady ? (
            <VadText variant="caption" tone="tertiary">
              Balance reading is available, but VAD on-chain trading is not activated on this network.
            </VadText>
          ) : null}
        </View>
      ) : (
        <VadText variant="caption" tone="secondary">No verified wallet balance could be read for this network.</VadText>
      )}
    </VadCard>
  );
}

function formatUsdc(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function shortAddress(value: string) {
  return value.length <= 18 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`;
}
