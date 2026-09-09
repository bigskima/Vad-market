import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { listMarkets, type MarketCatalogItem } from '@/services/market-api';
import { MarketDetailHeader } from './components/market-detail-header';

export function MarketDetailScreen({ instrumentPublicId }: { instrumentPublicId: string }) {
  const theme = useVadTheme();
  const [market, setMarket] = useState<MarketCatalogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const markets = await listMarkets();
      setMarket(markets.find((item) => item.instrument_public_id === instrumentPublicId) ?? null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Market details are unavailable.'); }
    finally { setLoading(false); }
  }, [instrumentPublicId]);

  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);

  if (loading) return <View style={{ gap: theme.spacing.sm }}><VadSkeleton height={40} width="75%" /><VadSkeleton height={180} /><VadSkeleton height={100} /></View>;
  if (error || !market) return <VadErrorState title="Market unavailable" body={error ?? 'This market is not currently in the live catalog.'} onRetry={() => void load()} />;

  return <View style={{ gap: theme.spacing.lg }}>
    <MarketDetailHeader market={market} />
    <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
      <VadText variant="heading">How this market works</VadText>
      <VadText tone="secondary">Prices express participant conviction. Final truth comes from the configured oracle and governance process, not the creator, AI, or current market price.</VadText>
      <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}><Meta label="Asset" value={market.asset_code} /><Meta label="Status" value={market.status} /></View>
    </VadCard>
  </View>;
}

function Meta({ label, value }: { label: string; value: string }) { const theme = useVadTheme(); return <VadCard variant="muted" style={{ flex: 1, padding: theme.spacing.sm }}><VadText variant="caption" tone="secondary">{label}</VadText><VadText variant="bodyStrong">{value}</VadText></VadCard>; }
