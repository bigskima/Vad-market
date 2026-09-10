import { Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { pct } from '@/features/markets/format';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';

export function ConvictionComposer({
  markets,
  marketFilter,
  selectedMarket,
  body,
  stance,
  working,
  onBodyChange,
  onMarketChange,
  onStanceChange,
  onPublish,
}: {
  markets: MarketCatalogItem[];
  marketFilter?: MarketCatalogItem;
  selectedMarket: MarketCatalogItem | null;
  body: string;
  stance: 'YES' | 'NO' | null;
  working: boolean;
  onBodyChange: (value: string) => void;
  onMarketChange: (market: MarketCatalogItem | null) => void;
  onStanceChange: (stance: 'YES' | 'NO') => void;
  onPublish: () => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const wide = density.width >= 760;

  return (
    <VadCard variant="raised" style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
      <View style={{ gap: 1 }}>
        <VadText variant="caption" tone="brand">NEW CONVICTION</VadText>
        <VadText variant="heading">Share the reasoning first.</VadText>
        <VadText variant="caption" tone="secondary">Attach a market only when the post is directly about that question.</VadText>
      </View>

      <VadInput
        multiline
        value={body}
        onChangeText={onBodyChange}
        placeholder="What do you believe, and why?"
        hint={body.trim() ? body.trim().length + ' characters' : undefined}
      />

      <View style={{ flexDirection: wide && !marketFilter ? 'row' : 'column', alignItems: 'flex-start', gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
        <View style={{ flex: 1, width: '100%', gap: 6 }}>
          {marketFilter ? (
            <View style={{ borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.brandPrimary, backgroundColor: theme.colors.brandSoft, padding: density.compact ? 9 : 11, gap: 2 }}>
              <VadText variant="caption" tone="brand">ATTACHED MARKET</VadText>
              <VadText variant="bodyStrong" numberOfLines={2}>{marketFilter.title}</VadText>
            </View>
          ) : (
            <>
              <VadText variant="label" tone="secondary">Attach a live market · optional</VadText>
              <View style={{ gap: 5 }}>
                {markets.slice(0, density.compact ? 3 : 5).map((item) => {
                  const selected = selectedMarket?.instrument_public_id === item.instrument_public_id;
                  return (
                    <Pressable
                      key={item.instrument_public_id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => onMarketChange(selected ? null : item)}
                      style={({ pressed }) => ({
                        minHeight: density.compact ? 48 : 52,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: theme.spacing.sm,
                        borderWidth: 1,
                        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
                        borderRadius: theme.radius.md,
                        backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        opacity: pressed ? 0.68 : 1,
                      })}
                    >
                      <View style={{ flex: 1, gap: 1 }}>
                        <VadText variant="caption" tone={selected ? 'brand' : 'primary'} numberOfLines={2}>{item.title}</VadText>
                        <VadText variant="caption" tone="tertiary">YES {pct(item.yes_price)} · NO {pct(item.no_price)}</VadText>
                      </View>
                      <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: selected ? theme.colors.brandPrimary : theme.colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
                        {selected ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.brandPrimary }} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {selectedMarket ? (
          <View style={{ width: wide ? 230 : '100%', gap: 6 }}>
            <VadText variant="label" tone="secondary">Your stance · optional</VadText>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Stance label="YES" value={pct(selectedMarket.yes_price)} selected={stance === 'YES'} positive onPress={() => onStanceChange('YES')} />
              <Stance label="NO" value={pct(selectedMarket.no_price)} selected={stance === 'NO'} positive={false} onPress={() => onStanceChange('NO')} />
            </View>
          </View>
        ) : null}
      </View>

      <VadButton label="Publish conviction" loading={working} disabled={!body.trim()} onPress={onPublish} />
    </VadCard>
  );
}

function Stance({ label, value, selected, positive, onPress }: { label: string; value: string; selected: boolean; positive: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const color = positive ? theme.colors.yes : theme.colors.no;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: density.compact ? 48 : 54,
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: selected ? color : theme.colors.border,
        borderRadius: theme.radius.md,
        backgroundColor: selected ? (positive ? theme.colors.yesSoft : theme.colors.noSoft) : theme.colors.surface,
        paddingHorizontal: 10,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <VadText variant="caption" tone={positive ? 'yes' : 'no'}>{label}</VadText>
      <VadText variant={density.compact ? 'bodyStrong' : 'heading'} tone={positive ? 'yes' : 'no'}>{value}</VadText>
    </Pressable>
  );
}
