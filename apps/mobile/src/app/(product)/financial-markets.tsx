import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { CryptoMarketPricesPanel } from '@/features/markets/components/crypto-market-prices-panel';
import { FinancialAssetsDataPanel } from '@/features/markets/components/financial-assets-data-panel';
import { ProductRoute } from '@/features/navigation/product-route';
import { TourTarget } from '@/features/tour/tour-provider';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { FinancialAssetClass } from '@/services/financial-market-data-api';

type Tab = 'CRYPTO' | FinancialAssetClass;
const tabs: { value: Tab; label: string }[] = [
  { value: 'CRYPTO', label: 'Crypto' },
  { value: 'STOCKS', label: 'Stocks' },
  { value: 'COMMODITIES', label: 'Commodities' },
  { value: 'FOREX', label: 'Forex' },
  { value: 'ECONOMICS', label: 'Economic data' },
];

export default function FinancialMarketsRoute() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('CRYPTO');

  return (
    <ProductRoute active="Markets" hideTopBar>
      <View style={{ width: '100%', gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
        <TourTarget id="financial-assets">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Markets"
            onPress={() => router.replace('/markets')}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14,
              borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <VadIcon name="back" size={20} tone="secondary" />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <VadText variant="title" style={{ fontSize: density.phone ? 29 : 34, lineHeight: density.phone ? 34 : 40 }}>
              Financial markets
            </VadText>
            <VadText variant="caption" tone="secondary">
              Live public asset data for context. Prediction markets and their settlement rules stay separate.
            </VadText>
          </View>
        </View>
        </TourTarget>

        <TourTarget id="crypto-assets-tab">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {tabs.map((item) => (
            <Pressable
              key={item.value}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === item.value }}
              onPress={() => { setTab(item.value); setSearch(''); }}
              style={({ pressed }) => ({
                paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20, borderWidth: 1,
                borderColor: tab === item.value ? theme.colors.brandPrimary : theme.colors.border,
                backgroundColor: tab === item.value ? theme.colors.brandSoft : theme.colors.surface,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <VadText variant="label" tone={tab === item.value ? 'brand' : 'secondary'}>{item.label}</VadText>
            </Pressable>
          ))}
        </View>
        </TourTarget>

        <VadInput
          value={search}
          onChangeText={setSearch}
          placeholder={tab === 'CRYPTO' ? 'Search crypto by name or symbol…' : tab === 'STOCKS' ? 'Search company or ticker, e.g. AAPL…' : tab === 'COMMODITIES' ? 'Search gold, oil, natural gas…' : tab === 'FOREX' ? 'Search a currency pair, e.g. EUR/USD…' : 'Search inflation, GDP, unemployment…'}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search financial assets"
        />

        {tab === 'CRYPTO' ? (
          <CryptoMarketPricesPanel search={search} showHeader={false} />
        ) : (
          <FinancialAssetsDataPanel assetClass={tab} search={search} showHeader={false} />
        )}
        <VadText variant="caption" tone="tertiary">
          IPOs, earnings and corporate announcements remain event-based prediction markets. Where a market has an approved tradable asset symbol, its detail page can also show the corresponding public quote.
        </VadText>
      </View>
    </ProductRoute>
  );
}
