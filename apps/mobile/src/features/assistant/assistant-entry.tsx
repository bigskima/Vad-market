import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export function AssistantEntry({
  label = 'Ask VAD Assistant',
  detail,
  prompt,
  marketId,
  sourceRoute,
  compact = false,
}: {
  label?: string;
  detail: string;
  prompt: string;
  marketId?: string | null;
  sourceRoute: string;
  compact?: boolean;
}) {
  const theme = useVadTheme();

  function openAssistant() {
    router.push({
      pathname: '/assistant',
      params: {
        prompt,
        from: sourceRoute,
        ...(marketId ? { marketId } : {}),
      },
    });
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      onPress={openAssistant}
      style={({ pressed }) => ({
        minHeight: compact ? 42 : 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        paddingHorizontal: compact ? 10 : 12,
        paddingVertical: compact ? 7 : 9,
        borderWidth: 1,
        borderColor: theme.colors.brandPrimary,
        borderRadius: compact ? theme.radius.pill : theme.radius.lg,
        backgroundColor: theme.colors.brandSoft,
        opacity: pressed ? 0.68 : 1,
        transform: [{ scale: pressed ? 0.992 : 1 }],
      })}
    >
      <View
        style={{
          width: compact ? 26 : 32,
          height: compact ? 26 : 32,
          borderRadius: compact ? 13 : 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.brandPrimary,
        }}
      >
        <VadText variant="caption" tone="inverse">V</VadText>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: compact ? 0 : 1 }}>
        <VadText variant={compact ? 'caption' : 'bodyStrong'} tone="brand" numberOfLines={1}>{label}</VadText>
        {!compact ? <VadText variant="caption" tone="secondary" numberOfLines={1}>{detail}</VadText> : null}
      </View>
      <VadIcon name="chevronRight" size={14} tone="brand" />
    </Pressable>
  );
}
