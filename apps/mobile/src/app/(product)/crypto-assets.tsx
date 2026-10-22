import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { CryptoMarketPricesPanel } from '@/features/markets/components/crypto-market-prices-panel';
import { ProductRoute } from '@/features/navigation/product-route';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';

export default function CryptoAssetsRoute() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [search, setSearch] = useState('');

  return (
    <ProductRoute active="Home" hideTopBar>
      <View style={{ width: '100%', gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Home"
            onPress={() => router.replace('/home')}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 42,
              height: 42,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <VadIcon name="back" size={20} tone="secondary" />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <VadText variant="title" style={{ fontSize: density.phone ? 29 : 34, lineHeight: density.phone ? 34 : 40 }}>
              Crypto assets
            </VadText>
            <VadText variant="caption" tone="secondary">
              Live public spot prices, separate from VAD prediction markets.
            </VadText>
          </View>
        </View>

        <VadInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search crypto assets by name or symbol…"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search crypto assets"
          accessibilityHint="Search the configured public crypto price catalogue by coin name or symbol"
          leading={<VadIcon name="search" size={19} tone="tertiary" />}
        />

        <CryptoMarketPricesPanel search={search} showHeader={false} />
      </View>
    </ProductRoute>
  );
}
