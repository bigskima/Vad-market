import { View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useLiveNow } from '@/hooks/use-live-now';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { describeMarketTiming, formatRelativeTimestamp } from '../market-state';

export function MarketTimeStatus({
  market,
  compact = false,
  showAbsolute = false,
  fill = false,
}: {
  market: MarketCatalogItem;
  compact?: boolean;
  showAbsolute?: boolean;
  fill?: boolean;
}) {
  const theme = useVadTheme();
  const now = useLiveNow(1000);
  const timing = describeMarketTiming(market.closes_at, market.status, now);
  const palette = timingPalette(timing.tone, theme);

  if (compact) {
    return (
      <View
        accessibilityRole="text"
        accessibilityLabel={`${timing.headline}. ${timing.absolute ?? ''}`.trim()}
        style={{
          minHeight: 26,
          maxWidth: fill ? undefined : 190,
          flex: fill ? 1 : undefined,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: theme.radius.pill,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.background,
        }}
      >
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.foreground }} />
        <VadText variant="caption" tone={palette.textTone} numberOfLines={1} style={{ flexShrink: 1 }}>
          {timing.compact}
        </VadText>
      </View>
    );
  }

  return (
    <View
      accessibilityRole="summary"
      style={{
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        gap: 3,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.foreground }} />
        <VadText variant="bodyStrong" tone={palette.textTone} style={{ flex: 1 }}>
          {timing.headline}
        </VadText>
      </View>
      <VadText variant="caption" tone="secondary">
        {timing.detail}
      </VadText>
      {showAbsolute && timing.absolute ? (
        <VadText variant="caption" tone="tertiary">
          {timing.absolute}
        </VadText>
      ) : null}
    </View>
  );
}

export function MarketRelativeTime({
  value,
  prefix,
  fallback = 'No activity yet',
}: {
  value: string | null | undefined;
  prefix?: string;
  fallback?: string;
}) {
  const now = useLiveNow();
  const relative = formatRelativeTimestamp(value, now);
  return (
    <VadText variant="caption" tone="tertiary" numberOfLines={1}>
      {relative ? `${prefix ? `${prefix} ` : ''}${relative}` : fallback}
    </VadText>
  );
}

function timingPalette(tone: ReturnType<typeof describeMarketTiming>['tone'], theme: ReturnType<typeof useVadTheme>) {
  if (tone === 'danger') {
    return {
      background: theme.colors.noSoft,
      border: theme.colors.danger,
      foreground: theme.colors.danger,
      textTone: 'danger' as const,
    };
  }
  if (tone === 'warning') {
    return {
      background: theme.colors.warningSoft,
      border: theme.colors.warning,
      foreground: theme.colors.warning,
      textTone: 'warning' as const,
    };
  }
  if (tone === 'yes') {
    return {
      background: theme.colors.yesSoft,
      border: theme.colors.yes,
      foreground: theme.colors.yes,
      textTone: 'yes' as const,
    };
  }
  if (tone === 'brand') {
    return {
      background: theme.colors.brandSoft,
      border: theme.colors.brandPrimary,
      foreground: theme.colors.brandPrimary,
      textTone: 'brand' as const,
    };
  }
  return {
    background: theme.colors.surfaceMuted,
    border: theme.colors.border,
    foreground: theme.colors.textTertiary,
    textTone: 'secondary' as const,
  };
}
