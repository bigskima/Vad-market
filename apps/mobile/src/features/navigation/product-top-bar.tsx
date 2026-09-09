import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { ProductTab } from './product-tab-bar';

export function ProductTopBar({
  active,
  email,
  isAdmin,
  canCreate,
  onCreate,
  onAdmin,
  onAccount,
}: {
  active: ProductTab;
  email: string;
  isAdmin: boolean;
  canCreate: boolean;
  onCreate: () => void;
  onAdmin: () => void;
  onAccount: () => void;
}) {
  const theme = useVadTheme();
  const insets = useSafeAreaInsets();
  const initial = email.trim().charAt(0).toUpperCase() || 'V';

  return (
    <View
      style={{
        paddingTop: insets.top + theme.spacing.xs,
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.background,
      }}
    >
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <VadLogo size={34} />
        <View style={{ gap: 1 }}>
          <VadText variant="caption" tone="tertiary">VAD</VadText>
          <VadText variant="bodyStrong">{active}</VadText>
        </View>
      </View>

      {canCreate ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Propose a market"
          onPress={onCreate}
          style={({ pressed }) => ({
            minWidth: 38,
            height: 38,
            borderRadius: 19,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.brandPrimary,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <VadText variant="heading" tone="inverse">+</VadText>
        </Pressable>
      ) : null}

      {isAdmin ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open VAD operations"
          onPress={onAdmin}
          style={({ pressed }) => ({
            minHeight: 38,
            justifyContent: 'center',
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.surfaceRaised,
            paddingHorizontal: theme.spacing.sm,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <VadText variant="caption" tone="brand">Ops</VadText>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open account"
        onPress={onAccount}
        style={({ pressed }) => ({
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: active === 'Account' ? theme.colors.brandPrimary : theme.colors.borderStrong,
          backgroundColor: active === 'Account' ? theme.colors.brandSoft : theme.colors.surfaceRaised,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <VadText variant="label" tone={active === 'Account' ? 'brand' : 'primary'}>
          {initial}
        </VadText>
      </Pressable>
    </View>
  );
}
