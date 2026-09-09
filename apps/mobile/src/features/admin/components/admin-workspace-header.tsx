import { Pressable, View } from 'react-native';
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
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => ({
            minHeight: 38,
            justifyContent: 'center',
            borderRadius: theme.radius.pill,
            borderWidth: 1,
            borderColor: theme.colors.border,
            paddingHorizontal: theme.spacing.sm,
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <VadText variant="caption" tone="secondary">
            ← {backLabel}
          </VadText>
        </Pressable>

        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
          }}
        >
          <VadLogo size={30} />
          <View style={{ flex: 1 }}>
            <VadText variant="bodyStrong">{title}</VadText>
            <VadText variant="caption" tone="secondary">
              {subtitle}
            </VadText>
          </View>
        </View>

        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={onAction}
            style={({ pressed }) => ({
              minHeight: 38,
              justifyContent: 'center',
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.brandSoft,
              paddingHorizontal: theme.spacing.sm,
              opacity: pressed ? 0.65 : 1,
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
