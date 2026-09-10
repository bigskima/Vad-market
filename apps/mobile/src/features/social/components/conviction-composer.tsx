import {
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { pct } from '@/features/markets/format';
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
  const { width } = useWindowDimensions();
  const wide = width >= 760;

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        paddingVertical: theme.spacing.lg,
        gap: theme.spacing.lg,
      }}
    >
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">NEW CONVICTION</VadText>
        <VadText variant="heading">Share the reasoning first.</VadText>
        <VadText variant="caption" tone="secondary">
          Attach a market only when your post is directly about that question.
        </VadText>
      </View>

      <VadInput
        multiline
        value={body}
        onChangeText={onBodyChange}
        placeholder="What do you believe, and why?"
        hint={body.trim() ? body.trim().length + ' characters' : undefined}
      />

      <View
        style={{
          flexDirection: wide && !marketFilter ? 'row' : 'column',
          alignItems: 'flex-start',
          gap: theme.spacing.lg,
        }}
      >
        <View style={{ flex: 1, width: '100%', gap: theme.spacing.sm }}>
          {marketFilter ? (
            <View
              style={{
                borderLeftWidth: 3,
                borderLeftColor: theme.colors.brandPrimary,
                backgroundColor: theme.colors.brandSoft,
                padding: theme.spacing.md,
                gap: 2,
              }}
            >
              <VadText variant="caption" tone="brand">
                ATTACHED MARKET
              </VadText>
              <VadText variant="bodyStrong" numberOfLines={3}>
                {marketFilter.title}
              </VadText>
            </View>
          ) : (
            <>
              <VadText variant="label" tone="secondary">
                Attach a live market · optional
              </VadText>

              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                }}
              >
                {markets.slice(0, 5).map((item) => {
                  const selected =
                    selectedMarket?.instrument_public_id ===
                    item.instrument_public_id;

                  return (
                    <Pressable
                      key={item.instrument_public_id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() =>
                        onMarketChange(selected ? null : item)
                      }
                      style={({ pressed }) => ({
                        minHeight: 62,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: theme.spacing.sm,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.border,
                        paddingVertical: theme.spacing.sm,
                        opacity: pressed ? 0.68 : 1,
                      })}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <VadText
                          variant="caption"
                          tone={selected ? 'brand' : 'primary'}
                          numberOfLines={2}
                        >
                          {item.title}
                        </VadText>
                        <VadText variant="caption" tone="tertiary">
                          YES {pct(item.yes_price)} · NO {pct(item.no_price)}
                        </VadText>
                      </View>

                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          borderWidth: 2,
                          borderColor: selected
                            ? theme.colors.brandPrimary
                            : theme.colors.borderStrong,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {selected ? (
                          <View
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 5,
                              backgroundColor: theme.colors.brandPrimary,
                            }}
                          />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {selectedMarket ? (
          <View
            style={{
              width: wide ? 250 : '100%',
              gap: theme.spacing.sm,
            }}
          >
            <VadText variant="label" tone="secondary">
              Your stance · optional
            </VadText>

            <View
              style={{
                flexDirection: 'row',
                gap: theme.spacing.xs,
              }}
            >
              <Stance
                label="YES"
                value={pct(selectedMarket.yes_price)}
                selected={stance === 'YES'}
                positive
                onPress={() => onStanceChange('YES')}
              />
              <Stance
                label="NO"
                value={pct(selectedMarket.no_price)}
                selected={stance === 'NO'}
                positive={false}
                onPress={() => onStanceChange('NO')}
              />
            </View>
          </View>
        ) : null}
      </View>

      <VadButton
        label="Publish conviction"
        loading={working}
        disabled={!body.trim()}
        onPress={onPublish}
      />
    </View>
  );
}

function Stance({
  label,
  value,
  selected,
  positive,
  onPress,
}: {
  label: string;
  value: string;
  selected: boolean;
  positive: boolean;
  onPress: () => void;
}) {
  const theme = useVadTheme();
  const color = positive ? theme.colors.yes : theme.colors.no;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 68,
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: selected ? color : theme.colors.border,
        borderRadius: theme.radius.md,
        backgroundColor: selected
          ? positive
            ? theme.colors.yesSoft
            : theme.colors.noSoft
          : 'transparent',
        paddingHorizontal: theme.spacing.md,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <VadText variant="caption" style={{ color }}>{label}</VadText>
      <VadText variant="heading" style={{ color }}>{value}</VadText>
    </Pressable>
  );
}
