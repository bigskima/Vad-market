import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, View } from 'react-native';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { rememberPendingGrowthCode } from '@/services/growth-attribution';
import { resolveGrowthCode } from '@/services/growth-api';

type LandingData = Awaited<ReturnType<typeof resolveGrowthCode>>;

export default function GrowthLinkLanding() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const { session } = useAuth();
  const theme = useVadTheme();
  const density = useProductDensity();
  const code = useMemo(() => {
    const value = Array.isArray(params.code) ? params.code[0] : params.code;
    return (value ?? '').trim().toUpperCase();
  }, [params.code]);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LandingData | null>(null);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (!code) {
        setLoading(false);
        return;
      }
      void resolveGrowthCode(code)
        .then((result) => {
          if (!active) return;
          setData(result);
          if (result.valid && result.code) rememberPendingGrowthCode(result.code);
        })
        .catch(() => {
          if (active) setData({ valid: false });
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [code]);

  const continueToVad = () => {
    router.replace(session ? '/home' : '/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, padding: density.phone ? theme.spacing.md : theme.spacing.xl }}>
      <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center', flex: 1, justifyContent: 'center', gap: theme.spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <VadLogo size={38} />
          <VadText variant="heading">VAD</VadText>
        </View>

        {loading ? (
          <View style={{ gap: theme.spacing.md }}>
            <VadSkeleton height={210} radius={theme.radius.xl} />
            <VadSkeleton height={56} radius={theme.radius.lg} />
          </View>
        ) : data?.valid ? (
          <VadCard variant="raised" style={{ padding: 0, overflow: 'hidden' }}>
            {data.campaign?.heroImageUrl ? (
              <Image source={{ uri: data.campaign.heroImageUrl }} style={{ width: '100%', height: density.phone ? 180 : 240 }} resizeMode="cover" />
            ) : data.partner?.avatarUrl ? (
              <View style={{ minHeight: 170, backgroundColor: theme.colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={{ uri: data.partner.avatarUrl }} style={{ width: 100, height: 100, borderRadius: 50 }} resizeMode="cover" />
              </View>
            ) : (
              <View style={{ minHeight: 160, backgroundColor: theme.colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                <VadLogo size={68} />
              </View>
            )}

            <View style={{ padding: density.phone ? theme.spacing.lg : theme.spacing.xl, gap: theme.spacing.lg }}>
              <View style={{ gap: theme.spacing.sm }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                  <VadChip label={data.campaign?.badgeText || (data.partner ? 'VAD PARTNER' : 'VAD INVITE')} tone="brand" />
                  {data.code ? <VadChip label={`Code ${data.code}`} tone="neutral" /> : null}
                </View>
                <VadText variant={density.phone ? 'title' : 'display'}>
                  {data.partner?.displayName
                    ? `${data.partner.displayName} invited you to VAD`
                    : data.campaign?.name
                      ? data.campaign.name
                      : 'You’ve been invited to VAD'}
                </VadText>
                <VadText tone="secondary">
                  {data.campaign?.name && data.partner?.displayName
                    ? `This invitation is linked to ${data.campaign.name}. Create or sign in to your VAD account to continue.`
                    : 'Discover markets, follow the outcomes that matter to you and manage your activity from one VAD account.'}
                </VadText>
              </View>

              <VadCard variant="muted" style={{ gap: 4 }}>
                <VadText variant="bodyStrong">
                  {data.rewardable ? 'This code is linked to a promotion' : 'This is a standard VAD invite'}
                </VadText>
                <VadText variant="caption" tone="secondary">
                  {data.rewardable
                    ? 'Any reward depends on the promotion rules shown in VAD after you sign in. A code alone does not guarantee a reward.'
                    : 'A standard invite does not automatically earn money for the person who shared it.'}
                </VadText>
              </VadCard>

              <VadButton label={session ? 'Continue to VAD' : 'Continue'} onPress={continueToVad} />
            </View>
          </VadCard>
        ) : (
          <VadCard variant="raised" style={{ gap: theme.spacing.lg }}>
            <View style={{ gap: theme.spacing.sm }}>
              <VadText variant="caption" tone="brand">VAD INVITE</VadText>
              <VadText variant="title">This invitation is no longer available</VadText>
              <VadText tone="secondary">The code may have expired or the promotion may have ended. You can still continue to VAD normally.</VadText>
            </View>
            <VadButton label="Continue to VAD" onPress={continueToVad} />
          </VadCard>
        )}
      </View>
    </View>
  );
}
