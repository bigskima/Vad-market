import { usePathname } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadText } from '@/components/ui/vad-text';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { getAdminPageMeta } from './admin-navigation';
import { useAdminResponsive } from './use-admin-responsive';

export function AdminCommandBar({ onExit }: { onExit: () => void }) {
  const theme = useVadTheme();
  const data = useAdminData();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const responsive = useAdminResponsive();
  const page = getAdminPageMeta(pathname, data.access);

  const attention =
    data.marketQueue.length +
    data.oracleQueue.length +
    data.kycQueue.length +
    data.paymentQueue.length +
    data.providerChanges.length;

  const roleLabel = data.access.isSuperAdmin
    ? 'Super Admin'
    : data.access.roles.map((role) => role.name).join(' · ') || 'Operations';

  const cycleTheme = () => {
    const next =
      theme.preference === 'system'
        ? 'light'
        : theme.preference === 'light'
          ? 'dark'
          : 'system';
    theme.setPreference(next);
  };

  return (
    <View
      style={{
        paddingTop: responsive.desktop ? 0 : insets.top,
        minHeight: responsive.desktop ? 72 : 60 + insets.top,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.background,
        paddingHorizontal: responsive.desktop
          ? theme.spacing.xl
          : theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
      }}
    >
      {!responsive.desktop ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Return to VAD app"
          onPress={onExit}
          hitSlop={8}
          style={({ pressed }) => ({
            minWidth: 38,
            minHeight: 38,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.55 : 1,
          })}
        >
          <VadText variant="heading" tone="brand">‹</VadText>
        </Pressable>
      ) : null}

      {!responsive.desktop ? <VadLogo size={28} /> : null}

      <View style={{ flex: 1, minWidth: 0 }}>
        <VadText
          variant={responsive.desktop ? 'heading' : 'bodyStrong'}
          numberOfLines={1}
        >
          {page.label}
        </VadText>
        {responsive.width >= 430 ? (
          <VadText variant="caption" tone="secondary" numberOfLines={1}>
            {page.description}
          </VadText>
        ) : null}
      </View>

      {attention > 0 ? (
        <View
          accessibilityLabel={`${attention} visible attention items`}
          style={{
            minHeight: 32,
            minWidth: 32,
            paddingHorizontal: theme.spacing.sm,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.warningSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <VadText variant="caption" tone="warning">
            {attention}
          </VadText>
        </View>
      ) : null}

      {responsive.desktop ? (
        <View style={{ alignItems: 'flex-end', maxWidth: 180 }}>
          <VadText variant="caption" tone="secondary" numberOfLines={1}>
            {roleLabel}
          </VadText>
          <VadText variant="caption" tone="tertiary">
            {data.refreshing ? 'Refreshing…' : data.warning ? 'Data degraded' : 'Live control plane'}
          </VadText>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Refresh operations data"
        disabled={data.refreshing}
        onPress={() => void data.refresh()}
        style={({ pressed }) => ({
          minHeight: 38,
          justifyContent: 'center',
          paddingHorizontal: theme.spacing.sm,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surfaceRaised,
          opacity: data.refreshing ? 0.45 : pressed ? 0.65 : 1,
        })}
      >
        <VadText variant="caption" tone="brand">
          {data.refreshing ? 'Syncing' : responsive.mobile ? 'Sync' : 'Refresh'}
        </VadText>
      </Pressable>

      {responsive.desktop ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Theme ${theme.preference}. Change theme`}
          onPress={cycleTheme}
          style={({ pressed }) => ({
            minHeight: 38,
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.sm,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <VadText variant="caption" tone="secondary">
            {theme.preference === 'system'
              ? 'System'
              : theme.preference === 'light'
                ? 'Light'
                : 'Dark'}
          </VadText>
        </Pressable>
      ) : null}
    </View>
  );
}
