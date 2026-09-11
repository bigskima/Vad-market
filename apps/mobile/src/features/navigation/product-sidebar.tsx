import { Pressable, View } from 'react-native';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadButton } from '@/components/ui/vad-button';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { PRODUCT_TABS, type ProductTab } from './product-tab-bar';

export function ProductSidebar({
  active,
  email,
  isAdmin,
  canCreate,
  onNavigate,
  onCommunity,
  onCreate,
  onAdmin,
}: {
  active: ProductTab;
  email: string;
  isAdmin: boolean;
  canCreate: boolean;
  onNavigate: (tab: ProductTab) => void;
  onCommunity: () => void;
  onCreate: () => void;
  onAdmin: () => void;
}) {
  const theme = useVadTheme();
  const initial = email.trim().charAt(0).toUpperCase() || 'V';

  return (
    <View
      style={{
        width: 232,
        minWidth: 232,
        height: '100%',
        borderRightWidth: 1,
        borderRightColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.md,
        gap: theme.spacing.lg,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.xs }}>
        <VadLogo size={38} />
        <View style={{ minWidth: 0, gap: 1 }}>
          <VadText variant="bodyStrong">VAD</VadText>
          <VadText variant="caption" tone="tertiary" numberOfLines={1}>Value Asset Depot</VadText>
        </View>
      </View>

      {canCreate ? (
        <VadButton
          label="Create market"
          leading={<VadIcon name="plus" size={17} tone="inverse" />}
          onPress={onCreate}
        />
      ) : null}

      <View accessibilityRole="tablist" style={{ gap: theme.spacing.xxs }}>
        {PRODUCT_TABS.map((tab) => {
          const selected = tab.value === active;
          return (
            <Pressable
              key={tab.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onNavigate(tab.value)}
              style={({ pressed }) => ({
                minHeight: 48,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                paddingHorizontal: theme.spacing.md,
                borderRadius: theme.radius.lg,
                backgroundColor: selected ? theme.colors.brandSoft : pressed ? theme.colors.surfaceRaised : 'transparent',
                borderWidth: selected ? 1 : 0,
                borderColor: selected ? theme.colors.brandPrimary : 'transparent',
                opacity: pressed ? 0.78 : 1,
              })}
            >
              <VadIcon name={tab.icon} size={19} tone={selected ? 'brand' : 'secondary'} />
              <VadText variant="bodyStrong" tone={selected ? 'brand' : 'secondary'}>{tab.label}</VadText>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open community"
        onPress={onCommunity}
        style={({ pressed }) => ({
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.lg,
          backgroundColor: pressed ? theme.colors.surfaceRaised : 'transparent',
          opacity: pressed ? 0.68 : 1,
        })}
      >
        <VadIcon name="community" size={19} tone="secondary" />
        <VadText variant="bodyStrong" tone="secondary">Community</VadText>
      </Pressable>

      <View style={{ flex: 1 }} />

      {isAdmin ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open VAD operations"
          onPress={onAdmin}
          style={({ pressed }) => ({
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.surfaceRaised,
            opacity: pressed ? 0.72 : 1,
          })}
        >
          <VadIcon name="operations" size={19} tone="brand" />
          <VadText variant="bodyStrong">Operations</VadText>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open account"
        onPress={() => onNavigate('Account')}
        style={({ pressed }) => ({
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          paddingTop: theme.spacing.md,
          paddingHorizontal: theme.spacing.xs,
          opacity: pressed ? 0.72 : 1,
        })}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.brandSoft,
            borderWidth: 1,
            borderColor: theme.colors.brandPrimary,
          }}
        >
          <VadText variant="label" tone="brand">{initial}</VadText>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <VadText variant="bodyStrong" numberOfLines={1}>Account</VadText>
          <VadText variant="caption" tone="tertiary" numberOfLines={1}>{email}</VadText>
        </View>
      </Pressable>
    </View>
  );
}
