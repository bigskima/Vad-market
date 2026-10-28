import { ActivityIndicator, Pressable, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export function PlayLoadingState({ label = 'Loading VAD Play' }: { label?: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 132, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <ActivityIndicator color={theme.colors.brandPrimary} size="small" />
      <VadText variant="caption" tone="secondary">{label}</VadText>
    </View>
  );
}

export function PlayMessageState({
  title,
  body,
  actionLabel,
  onAction,
  tone = 'empty',
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'empty' | 'error' | 'info';
}) {
  const theme = useVadTheme();
  const accent = tone === 'error' ? theme.colors.danger : theme.colors.brandPrimary;

  return (
    <View
      style={{
        alignItems: 'flex-start',
        borderRadius: theme.radius.xl,
        borderWidth: 1,
        borderColor: tone === 'error' ? theme.colors.no : theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.xl,
        gap: 10,
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 21,
          backgroundColor: tone === 'error' ? theme.colors.noSoft : theme.colors.brandSoft,
        }}
      >
        <VadIcon name={tone === 'error' ? 'info' : 'activity'} size={21} color={accent} />
      </View>
      <VadText variant="heading">{title}</VadText>
      <VadText tone="secondary">{body}</VadText>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => ({
            minHeight: 42,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 15,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.brandPrimary,
            opacity: pressed ? 0.78 : 1,
            marginTop: 2,
          })}
        >
          <VadText variant="label" tone="inverse">{actionLabel}</VadText>
        </Pressable>
      ) : null}
    </View>
  );
}
