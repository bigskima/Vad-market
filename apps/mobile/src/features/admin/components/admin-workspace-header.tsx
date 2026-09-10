import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export function AdminWorkspaceHeader({
  title,
  subtitle,
  backLabel,
  actionLabel,
  onBack,
  onAction,
}: {
  title: string;
  subtitle: string;
  backLabel: string;
  actionLabel?: string;
  onBack: () => void;
  onAction?: () => void;
}) {
  const theme = useVadTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const compact = width < 420;

  return (
    <View
      style={{
        paddingTop: insets.top + theme.spacing.xs,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.background,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 1180,
          alignSelf: 'center',
          paddingHorizontal: desktop
            ? theme.spacing.xl
            : compact
              ? theme.spacing.md
              : theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
          minHeight: desktop ? 64 : 54,
          flexDirection: 'row',
          alignItems: 'center',
          gap: compact ? theme.spacing.xs : theme.spacing.md,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Back to ' + backLabel}
          onPress={onBack}
          hitSlop={8}
          style={({ pressed }) => ({
            minHeight: 40,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
            paddingRight: theme.spacing.sm,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <VadText variant="heading" tone="brand">‹</VadText>
          {!compact ? (
            <VadText variant="caption" tone="secondary">
              {desktop ? backLabel : 'Back'}
            </VadText>
          ) : null}
        </Pressable>

        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <VadLogo size={desktop ? 32 : 28} />
          <View style={{ flex: 1, gap: 1 }}>
            <VadText variant={desktop ? 'heading' : 'bodyStrong'} numberOfLines={1}>
              {title}
            </VadText>
            {!compact ? (
              <VadText variant="caption" tone="secondary" numberOfLines={1}>
                {subtitle}
              </VadText>
            ) : null}
          </View>
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.pill,
            paddingHorizontal: theme.spacing.sm,
            minHeight: 30,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <VadText variant="caption" tone="brand">OPS</VadText>
        </View>

        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={onAction}
            hitSlop={8}
            style={({ pressed }) => ({
              minHeight: 38,
              justifyContent: 'center',
              paddingLeft: theme.spacing.sm,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <VadText variant="caption" tone="brand">
              {actionLabel}
            </VadText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
