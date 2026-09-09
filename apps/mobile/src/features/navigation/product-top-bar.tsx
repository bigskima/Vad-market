import { Pressable, View } from 'react-native';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { ProductTab } from './product-tab-bar';

export function ProductTopBar({
  active,
  email,
  isAdmin,
  onHome,
  onAccount,
  onAdmin,
  onSignOut,
}: {
  active: ProductTab;
  email: string;
  isAdmin: boolean;
  onHome: () => void;
  onAccount: () => void;
  onAdmin: () => void;
  onSignOut: () => void;
}) {
  const theme = useVadTheme();
  const initial = email.trim().charAt(0).toUpperCase() || 'V';

  return (
    <View
      style={{
        paddingTop: 50,
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go to VAD home"
        onPress={onHome}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
      >
        <VadLogo size={36} />
        <View style={{ gap: 1 }}>
          <VadText variant="caption" tone="secondary">VAD</VadText>
          <VadText variant="bodyStrong">{active}</VadText>
        </View>
      </Pressable>

      {isAdmin ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open admin control plane"
          onPress={onAdmin}
          style={{
            minHeight: 36,
            justifyContent: 'center',
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.brandSoft,
            paddingHorizontal: theme.spacing.sm,
          }}
        >
          <VadText variant="caption" tone="brand">Ops</VadText>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open account"
        onPress={onAccount}
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: theme.colors.borderStrong,
          backgroundColor: theme.colors.surfaceRaised,
        }}
      >
        <VadText variant="label">{initial}</VadText>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={onSignOut}
        style={{
          minHeight: 36,
          justifyContent: 'center',
          borderRadius: theme.radius.pill,
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingHorizontal: theme.spacing.sm,
        }}
      >
        <VadText variant="caption" tone="secondary">Exit</VadText>
      </Pressable>
    </View>
  );
}
