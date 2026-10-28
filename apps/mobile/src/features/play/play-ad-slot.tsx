import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getActivePlaySponsorPlacement,
  getSponsorCreative,
  type PlayAdPlacement,
} from '@/services/play-ad-api';

export function PlayAdSlot({ placementCode }: { placementCode: string }) {
  const theme = useVadTheme();
  const [placement, setPlacement] = useState<PlayAdPlacement | null>(null);

  useEffect(() => {
    let active = true;
    getActivePlaySponsorPlacement(placementCode)
      .then((value) => { if (active) setPlacement(value); })
      .catch(() => { if (active) setPlacement(null); });
    return () => { active = false; };
  }, [placementCode]);

  if (!placement || placement.ad_format !== 'DIRECT_SPONSOR') return null;

  const creative = getSponsorCreative(placement);
  if (!creative || (!creative.title && !creative.imageUrl)) return null;

  const onOpen = async () => {
    if (!creative.clickUrl) return;
    try {
      await Linking.openURL(creative.clickUrl);
    } catch {
      // A sponsor link failing must not block the rest of VAD Play.
    }
  };

  const content = (
    <View style={{
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      minHeight: 104,
    }}>
      {creative.imageUrl ? (
        <Image
          source={{ uri: creative.imageUrl }}
          accessibilityLabel={creative.imageAlt || creative.title || 'Sponsored content'}
          resizeMode="cover"
          style={{ width: 112, minHeight: 104, backgroundColor: theme.colors.surfaceMuted }}
        />
      ) : null}
      <View style={{ flex: 1, minWidth: 0, padding: theme.spacing.md, justifyContent: 'center', gap: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <VadIcon name="sparkles" size={12} tone="tertiary" />
          <VadText variant="caption" tone="tertiary">
            {creative.sponsorName ? 'Sponsored · ' + creative.sponsorName : 'Sponsored'}
          </VadText>
        </View>
        {creative.title ? <VadText variant="heading" numberOfLines={2}>{creative.title}</VadText> : null}
        {creative.body ? <VadText variant="caption" tone="secondary" numberOfLines={3}>{creative.body}</VadText> : null}
        {creative.clickUrl ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <VadText variant="caption" tone="brand">{creative.ctaLabel}</VadText>
            <VadIcon name="arrowUpRight" size={13} tone="brand" />
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <View accessibilityLabel="Sponsored placement" style={{ width: '100%' }}>
      {creative.clickUrl ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={creative.title ? 'Sponsored: ' + creative.title : 'Open sponsor'}
          onPress={() => void onOpen()}
          style={({ pressed }) => ({ opacity: pressed ? 0.84 : 1, borderRadius: theme.radius.xl })}
        >
          {content}
        </Pressable>
      ) : content}
    </View>
  );
}
