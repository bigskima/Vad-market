import { Image, Pressable, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import type { PlayExperience } from '@/services/play-api';
import { playExperienceLabel } from '@/services/play-api';
import { useVadTheme } from '@/providers/theme-provider';

export function PlayExperienceTile({
  experience,
  onPress,
  compact = false,
}: {
  experience: PlayExperience;
  onPress: () => void;
  compact?: boolean;
}) {
  const theme = useVadTheme();
  const imageUrl = experience.card_asset_url ?? experience.hero_asset_url;
  const safeImageUrl = imageUrl?.startsWith('https://') ? imageUrl : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Open ' + experience.title}
      onPress={onPress}
      style={({ pressed }) => ({
        width: compact ? 244 : '48%',
        minWidth: compact ? 224 : 148,
        flexGrow: compact ? 0 : 1,
        overflow: 'hidden',
        borderRadius: theme.radius.xl,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        opacity: pressed ? 0.9 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      {safeImageUrl ? (
        <Image
          source={{ uri: safeImageUrl }}
          accessibilityLabel={experience.image_alt ?? experience.title}
          resizeMode="cover"
          style={{ width: '100%', height: compact ? 138 : 116, backgroundColor: theme.colors.surfaceMuted }}
        />
      ) : (
        <View
          style={{
            height: compact ? 138 : 116,
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
            padding: theme.spacing.md,
            backgroundColor: theme.colors.brandSoft,
          }}
        >
          <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
            <VadIcon name="activity" size={18} tone="brand" />
          </View>
          <VadText variant="caption" tone="secondary" style={{ marginTop: 8 }}>
            {playExperienceLabel(experience.experience_type)}
          </VadText>
        </View>
      )}

      <View style={{ padding: theme.spacing.md, gap: 6 }}>
        <VadText variant="caption" tone="brand" numberOfLines={1}>
          {playExperienceLabel(experience.experience_type)}
        </VadText>
        <VadText variant="heading" numberOfLines={2}>{experience.title}</VadText>
        {experience.subtitle ? (
          <VadText variant="caption" tone="secondary" numberOfLines={2}>{experience.subtitle}</VadText>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <VadText variant="caption" tone="brand">Explore</VadText>
          <VadIcon name="chevronRight" size={14} tone="brand" />
        </View>
      </View>
    </Pressable>
  );
}
