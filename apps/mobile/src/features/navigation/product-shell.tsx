import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { AdminOverviewScreen } from '@/features/admin/overview/admin-overview-screen';
import { HomeScreen } from '@/features/home/home-screen';
import { MarketsScreen } from '@/features/markets/markets-screen';
import { PortfolioScreen } from '@/features/portfolio/portfolio-screen';
import { ProposalScreen } from '@/features/proposals/proposal-screen';
import { useProductData } from '@/features/product/use-product-data';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { ProductTabBar, type ProductTab } from './product-tab-bar';

export function ProductShell({ email, canTrade, canCreatePost, canSubmitProposal, onSignOut }: { email: string; canTrade: boolean; canCreatePost: boolean; canSubmitProposal: boolean; onSignOut: () => Promise<void> | void }) {
  const theme = useVadTheme();
  const data = useProductData();
  const [tab, setTab] = useState<ProductTab>('Home');
  const [selectedMarket, setSelectedMarket] = useState<MarketCatalogItem | null>(null);
  const tabs = useMemo<ProductTab[]>(() => data.adminSummary ? ['Home', 'Markets', 'Portfolio', 'Create', 'Admin'] : ['Home', 'Markets', 'Portfolio', 'Create'], [data.adminSummary]);

  function openMarket(market: MarketCatalogItem) { setSelectedMarket(market); setTab('Markets'); }
  function changeTab(next: ProductTab) { setTab(next); if (next !== 'Markets') setSelectedMarket(null); }

  if (data.loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}><ActivityIndicator color={theme.colors.brandPrimary} size="large" /></View>;

  return <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <View style={{ paddingTop: 52, paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
      <View style={{ flex: 1 }}><VadText variant="heading" tone="brand">VAD</VadText><VadText variant="caption" tone="secondary">Value Asset Depot</VadText></View>
      <Pressable onPress={() => router.push('/account')} style={{ padding: theme.spacing.xs }}><VadText variant="label" tone="primary">Account</VadText></Pressable>
      <Pressable onPress={() => void onSignOut()} style={{ padding: theme.spacing.xs }}><VadText variant="label" tone="secondary">Sign out</VadText></Pressable>
    </View>

    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md }} refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.refresh} tintColor={theme.colors.brandPrimary} colors={[theme.colors.brandPrimary]} />}>
      {tab === 'Home' ? <HomeScreen email={email} markets={data.markets} ngn={data.ngn} canCreatePost={canCreatePost} onOpenMarket={openMarket} /> : null}
      {tab === 'Markets' ? <MarketsScreen markets={data.markets} initialMarket={selectedMarket} canTrade={canTrade} onSelectedChange={setSelectedMarket} onReload={data.load} /> : null}
      {tab === 'Portfolio' ? <PortfolioScreen positions={data.positions} orders={data.orders} ngn={data.ngn} /> : null}
      {tab === 'Create' ? <ProposalScreen proposals={data.proposals} canSubmitProposal={canSubmitProposal} onReload={data.load} /> : null}
      {tab === 'Admin' && data.adminSummary ? <AdminOverviewScreen summary={data.adminSummary} marketQueue={data.adminMarkets} oracleQueue={data.adminOracle} /> : null}
    </ScrollView>

    <ProductTabBar tabs={tabs} active={tab} onChange={changeTab} />
  </View>;
}
