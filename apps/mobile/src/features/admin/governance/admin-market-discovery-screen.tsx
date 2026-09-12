import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { VadButton } from '@/components/ui/vad-button';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { getAdminFeaturedMarketSettings, getAdminMarketPublicationQueue, getAdminTrendingMarketSnapshot, type AdminFeaturedMarketSettings, type AdminMarketPublicationRow, type AdminTrendingMarketSnapshot } from '@/services/admin-market-publishing-api';
import { AdminFeaturedMarketPanel } from './admin-featured-market-panel';
import { AdminMarketDiscoveryModeration } from './admin-market-discovery-moderation';
import { AdminTrendingMarketPanel } from './admin-trending-market-panel';

export function AdminMarketDiscoveryScreen() {
  const theme = useVadTheme();
  const [rows, setRows] = useState<AdminMarketPublicationRow[]>([]);
  const [featured, setFeatured] = useState<AdminFeaturedMarketSettings | null>(null);
  const [trending, setTrending] = useState<AdminTrendingMarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    setError(null);
    try {
      const [nextRows, nextFeatured, nextTrending] = await Promise.all([
        getAdminMarketPublicationQueue(),
        getAdminFeaturedMarketSettings(),
        getAdminTrendingMarketSnapshot(),
      ]);
      setRows(nextRows);
      setFeatured(nextFeatured);
      setTrending(nextTrending);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Market discovery controls could not be loaded.');
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const changed = useCallback(async (nextMessage: string) => {
    setMessage(nextMessage);
    await load(true);
  }, [load]);

  if (loading) {
    return <View style={{ gap: theme.spacing.md }}><VadSkeleton width="54%" height={30} /><VadSkeleton height={220} radius={theme.radius.lg} /><VadSkeleton height={260} radius={theme.radius.lg} /></View>;
  }

  if (error && (!featured || !trending)) {
    return <VadErrorState title="Featured & Trending controls unavailable" message={error} onRetry={() => void load()} />;
  }

  if (!featured || !trending) return null;

  const featuredCount = rows.filter((row) => row.instrument_status === 'OPEN' && Boolean(row.automatic_featured)).length;
  const trendingCount = Math.min(trending.rankings.length, trending.settings.maxMarkets);
  const hiddenCount = trending.suppressions.filter((item) => item.featuredSuppressed || item.trendingSuppressed).length;

  return <View style={{ gap: theme.spacing.xl }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.md, flexWrap: 'wrap' }}>
      <View style={{ flex: 1, minWidth: 240, gap: 4 }}><VadText variant="label" tone="brand">HOME DISCOVERY</VadText><VadText variant="title">Featured & Trending Markets</VadText><VadText variant="caption" tone="secondary">Featured shows sustained market strength. Trending detects genuine trading momentum as it accelerates.</VadText></View>
      <VadButton label="Refresh" variant="secondary" size="small" fullWidth={false} loading={refreshing} onPress={() => void load(true)} />
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}><VadChip label={`${featuredCount} featured`} tone="yes" /><VadChip label={`${trendingCount} trending`} tone="warning" /><VadChip label={`${hiddenCount} manually hidden`} tone={hiddenCount ? 'warning' : 'neutral'} /></View>
    {message ? <View style={{ borderLeftWidth: 3, borderLeftColor: theme.colors.yes, backgroundColor: theme.colors.yesSoft, borderRadius: theme.radius.md, padding: theme.spacing.md, gap: 3 }}><VadText variant="bodyStrong" tone="yes">Updated</VadText><VadText variant="caption" tone="secondary">{message}</VadText></View> : null}
    {error ? <VadErrorState title="Some discovery information may be stale" message={error} onRetry={() => void load(true)} /> : null}
    <AdminFeaturedMarketPanel rows={rows} settings={featured} onChanged={changed} />
    <AdminTrendingMarketPanel rows={rows} snapshot={trending} onChanged={changed} />
    <AdminMarketDiscoveryModeration rows={rows} snapshot={trending} onChanged={changed} />
  </View>;
}
