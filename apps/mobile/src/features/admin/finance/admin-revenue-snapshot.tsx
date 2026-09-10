import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { formatAdminAssetAmount } from '@/services/finance-admin-api';

export function AdminRevenueSnapshot({
  title,
  description,
  sourceCodes,
  showPlatformBalance = false,
}: {
  title: string;
  description: string;
  sourceCodes?: string[];
  showPlatformBalance?: boolean;
}) {
  const theme = useVadTheme();
  const data = useAdminData();

  if (!data.finance?.assets.length) return null;

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 2 }}>
        <VadText variant="heading">{title}</VadText>
        <VadText variant="caption" tone="secondary">{description}</VadText>
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
        }}
      >
        {data.finance.assets.map((asset) => {
          const includedSources = sourceCodes?.length
            ? asset.vadRevenue.sources.filter((source) => sourceCodes.includes(source.code))
            : asset.vadRevenue.sources;
          const lifetime = sourceCodes?.length
            ? includedSources.reduce((sum, source) => sum + Number(source.earnedLifetime ?? 0), 0)
            : Number(asset.vadRevenue.earnedLifetime ?? 0);
          const recent = sourceCodes?.length
            ? includedSources.reduce((sum, source) => sum + Number(source.earned30d ?? 0), 0)
            : Number(asset.vadRevenue.earned30d ?? 0);

          return (
            <Pressable
              key={asset.assetCode}
              accessibilityRole="button"
              accessibilityLabel={`Open ${asset.assetCode} VAD revenue`}
              onPress={() => router.push('/admin/revenue')}
              style={({ pressed }) => ({
                flexGrow: 1,
                flexBasis: 260,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <VadCard
                variant="raised"
                style={{
                  minHeight: 126,
                  gap: theme.spacing.md,
                  borderColor: theme.colors.brandPrimary,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: theme.spacing.sm,
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <VadText variant="caption" tone="brand">
                      {asset.assetCode} · VAD REVENUE
                    </VadText>
                    <VadText variant="title">
                      {formatAdminAssetAmount(asset.assetCode, lifetime)}
                    </VadText>
                  </View>
                  <VadText variant="caption" tone="brand">Open →</VadText>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg }}>
                  <View style={{ minWidth: 110, flexGrow: 1, gap: 2 }}>
                    <VadText variant="bodyStrong">
                      {formatAdminAssetAmount(asset.assetCode, recent)}
                    </VadText>
                    <VadText variant="caption" tone="secondary">Earned in 30 days</VadText>
                  </View>
                  {showPlatformBalance ? (
                    <View style={{ minWidth: 130, flexGrow: 1, gap: 2 }}>
                      <VadText variant="bodyStrong">
                        {formatAdminAssetAmount(asset.assetCode, asset.platformBalance.total)}
                      </VadText>
                      <VadText variant="caption" tone="secondary">
                        Platform balance · not revenue
                      </VadText>
                    </View>
                  ) : null}
                </View>
              </VadCard>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
