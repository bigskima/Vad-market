import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { HomeScreen } from '@/features/home/home-screen';
import { MarketsScreen } from '@/features/markets/markets-screen';
import { PortfolioScreen } from '@/features/portfolio/portfolio-screen';
import { ProposalScreen } from '@/features/proposals/proposal-screen';
import { useProductData } from '@/features/product/use-product-data';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { ProductTabBar, type ProductTab } from './product-tab-bar';
import { ProductTopBar } from './product-top-bar';

export function ProductShell({ email, canTrade, canCreatePost, canSubmitProposal, onSignOut }: { email: string; canTrade: boolean; canCreatePost: boolean; canSubmitProposal: boolean; onSignOut: () => Promise<void> | void }) {
  const theme = useVadTheme();
  const data = useProductData();
  const [tab, setTab] = useState<ProductTab>('Home');
  const [selectedMarket, setSelectedMarket] = useState<MarketCatalogItem | null>(null);

  function openMarket(market: MarketCatalogItem) { setSelectedMarket(market); setTab('Markets'); }
  function changeTab(next: ProductTab) { setTab(next); if (next !== 'Markets') setSelectedMarket(null); }

  if (data.loading) return <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: 64, paddingHorizontal: theme.spacing.lg, gap: theme.spacing.lg }}><View style={{ gap: theme.spacing.xs }}><VadSkeleton width={82} height={24} /><VadSkeleton width={150} height={12} /></View><VadSkeleton height={150} radius={theme.radius.xl} /><View style={{ gap: theme.spacing.sm }}><VadSkeleton width="56%" height={28} /><VadSkeleton height={110} radius={theme.radius.lg} /><VadSkeleton height={110} radius={theme.radius.lg} /></View></View>;

  return <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <ProductTopBar
      active={tab}
      email={email}
      isAdmin={Boolean(data.adminSummary)}
      onHome={() => changeTab('Home')}
      onAccount={() => router.push('/account')}
      onAdmin={() => router.push('/admin')}
      onSignOut={() => void onSignOut()}
    />

    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md }} refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.refresh} tintColor={theme.colors.brandPrimary} colors={[theme.colors.brandPrimary]} />}>
      {data.error ? <VadErrorState message={data.error} onRetry={() => void data.load()} /> : null}
      {tab === 'Home' ? <HomeScreen email={email} markets={data.markets} ngn={data.ngn} canCreatePost={canCreatePost} onOpenMarket={openMarket} onExploreMarkets={() => changeTab('Markets')} /> : null}
      {tab === 'Markets' ? <MarketsScreen markets={data.markets} initialMarket={selectedMarket} canTrade={canTrade} onSelectedChange={setSelectedMarket} onReload={data.load} /> : null}
      {tab === 'Portfolio' ? <PortfolioScreen positions={data.positions} orders={data.orders} ngn={data.ngn} /> : null}
      {tab === 'Create' ? <ProposalScreen proposals={data.proposals} canSubmitProposal={canSubmitProposal} onReload={data.load} /> : null}
    </ScrollView>

    <ProductTabBar active={tab} onChange={changeTab} />
  </View>;
}
