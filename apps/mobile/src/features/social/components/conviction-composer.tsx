import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { MarketTimeStatus } from '@/features/markets/components/market-time-status';
import { probability } from '@/features/markets/format';
import { marketStatusMeta } from '@/features/markets/market-state';
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
  const [marketPickerOpen, setMarketPickerOpen] = useState(Boolean(marketFilter || selectedMarket));
  const liveMarkets = markets.filter((item) => marketStatusMeta(item.status).tradeOpen);
  const attachedMarket = marketFilter ?? selectedMarket;

  function toggleMarketPicker() {
    if (marketFilter) return;
    setMarketPickerOpen((value) => !value);
  }

  function chooseMarket(item: MarketCatalogItem) {
    const selected = selectedMarket?.instrument_public_id === item.instrument_public_id;
    onMarketChange(selected ? null : item);
    if (!selected) setMarketPickerOpen(false);
  }

  return (
    <VadCard variant="raised" style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
      <View style={{ gap: 1 }}>
        <VadText variant="caption" tone="brand">NEW CONVICTION</VadText>
        <VadText variant="heading">Start with your reasoning.</VadText>
        <VadText variant="caption" tone="secondary">Write the idea first. Attach a live market and prediction only when they add useful context.</VadText>
      </View>

      <VadInput
        multiline
        value={body}
        onChangeText={onBodyChange}
        placeholder="What do you believe, and why?"
        hint={body.trim() ? body.trim().length + ' characters' : 'Give enough reasoning for someone to understand your conviction.'}
      />

      {marketFilter ? (
        <View style={{ gap: theme.spacing.xs }}>
          <VadText variant="caption" tone="tertiary">ATTACHED MARKET</VadText>
          <AttachedMarket market={marketFilter} />
        </View>
      ) : attachedMarket ? (
        <View style={{ gap: theme.spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <VadText variant="caption" tone="tertiary">ATTACHED MARKET</VadText>
            <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
              <VadChip label="Change" tone="brand" onPress={() => setMarketPickerOpen(true)} />
              <VadChip label="Remove" onPress={() => { onMarketChange(null); setMarketPickerOpen(false); }} />
            </View>
          </View>
          <AttachedMarket market={attachedMarket} />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={marketPickerOpen ? 'Hide live market picker' : 'Attach a live market'}
          accessibilityState={{ expanded: marketPickerOpen }}
          onPress={toggleMarketPicker}
          style={({ pressed }) => ({
            minHeight: 54,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            borderRadius: theme.radius.lg,
            borderWidth: 1,
            borderColor: marketPickerOpen ? theme.colors.brandPrimary : theme.colors.border,
            backgroundColor: marketPickerOpen ? theme.colors.brandSoft : theme.colors.surface,
            paddingHorizontal: theme.spacing.md,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceRaised }}>
            <VadIcon name="markets" size={17} tone="brand" />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <VadText variant="bodyStrong">Attach a live market</VadText>
            <VadText variant="caption" tone="secondary">Optional · connect this reasoning to a tradable question.</VadText>
          </View>
          <VadIcon name={marketPickerOpen ? 'close' : 'plus'} size={16} tone="tertiary" />
        </Pressable>
      )}

      {!marketFilter && marketPickerOpen ? (
        <View style={{ gap: theme.spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <VadText variant="label" tone="secondary">Live markets</VadText>
            <VadText variant="caption" tone="tertiary">{liveMarkets.length} available</VadText>
          </View>
          {liveMarkets.length ? (
            <View style={{ gap: 6 }}>
              {liveMarkets.slice(0, density.compact ? 3 : 5).map((item) => {
                const selected = selectedMarket?.instrument_public_id === item.instrument_public_id;
                return (
                  <Pressable
                    key={item.instrument_public_id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => chooseMarket(item)}
                    style={({ pressed }) => ({
                      minHeight: density.compact ? 58 : 64,
                      gap: 6,
                      borderWidth: 1,
                      borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
                      borderRadius: theme.radius.md,
                      backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      opacity: pressed ? 0.68 : 1,
                    })}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
                      <View style={{ flex: 1, gap: 1 }}>
                        <VadText variant="caption" tone={selected ? 'brand' : 'primary'} numberOfLines={2}>{item.title}</VadText>
                        <VadText variant="caption" tone="tertiary">YES {probability(item.yes_price)} · NO {probability(item.no_price)}</VadText>
                      </View>
                      <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: selected ? theme.colors.brandPrimary : theme.colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
                        {selected ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.brandPrimary }} /> : null}
                      </View>
                    </View>
                    <MarketTimeStatus market={item} compact fill />
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <VadCard variant="muted" style={{ gap: 2 }}>
              <VadText variant="bodyStrong">No live markets to attach</VadText>
              <VadText variant="caption" tone="secondary">You can still publish your analysis without linking it to a market.</VadText>
            </VadCard>
          )}
        </View>
      ) : null}

      {attachedMarket ? (
        <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: theme.spacing.sm }}>
          <View style={{ flex: 1, gap: 2 }}>
            <VadText variant="label" tone="secondary">Add your prediction · optional</VadText>
            <VadText variant="caption" tone="tertiary">Your reasoning can stand alone, or you can state which side you currently favour.</VadText>
          </View>
          <View style={{ width: wide ? 250 : '100%', flexDirection: 'row', gap: 6 }}>
            <Stance label="YES" value={probability(attachedMarket.yes_price)} selected={stance === 'YES'} positive onPress={() => onStanceChange('YES')} />
            <Stance label="NO" value={probability(attachedMarket.no_price)} selected={stance === 'NO'} positive={false} onPress={() => onStanceChange('NO')} />
          </View>
        </View>
      ) : null}

      <View style={{ gap: 3 }}>
        <VadButton label={attachedMarket && stance ? `Publish ${stance} conviction` : 'Publish analysis'} loading={working} disabled={!body.trim()} onPress={onPublish} />
        <VadText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
          Posts add context to markets; they never determine official resolution.
        </VadText>
      </View>
    </VadCard>
  );
}

function AttachedMarket({ market }: { market: MarketCatalogItem }) {
  const theme = useVadTheme();
  const status = marketStatusMeta(market.status);
  return (
    <View style={{ borderRadius: theme.radius.md, borderWidth: 1, borderColor: status.tradeOpen ? theme.colors.brandPrimary : theme.colors.border, backgroundColor: status.tradeOpen ? theme.colors.brandSoft : theme.colors.surfaceMuted, padding: 10, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <VadText variant="bodyStrong" numberOfLines={2} style={{ flex: 1 }}>{market.title}</VadText>
        <VadChip label={status.label} tone={status.tone} />
      </View>
      <VadText variant="caption" tone="secondary">YES {probability(market.yes_price)} · NO {probability(market.no_price)}</VadText>
      <MarketTimeStatus market={market} compact fill />
    </View>
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
