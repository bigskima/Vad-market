import { router, usePathname } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadText } from '@/components/ui/vad-text';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getVisibleAdminGroups,
  isAdminItemSelected,
} from './admin-navigation';
import { useAdminResponsive } from './use-admin-responsive';

export function AdminSidebar({ onExit }: { onExit: () => void }) {
  const theme = useVadTheme();
  const pathname = usePathname();
  const data = useAdminData();
  const responsive = useAdminResponsive();
  const groups = getVisibleAdminGroups(data.access);
  const compact = responsive.compactSidebar;

  return (
    <View
      style={{
        width: responsive.sidebarWidth,
        borderRightWidth: 1,
        borderRightColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <View
        style={{
          minHeight: 72,
          paddingHorizontal: compact ? theme.spacing.md : theme.spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: compact ? 'center' : 'flex-start',
          gap: theme.spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <VadLogo size={34} />
        {!compact ? (
          <View style={{ flex: 1 }}>
            <VadText variant="bodyStrong">VAD Operations</VadText>
            <VadText variant="caption" tone="secondary">
              Control plane
            </VadText>
          </View>
        ) : null}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: compact ? theme.spacing.sm : theme.spacing.md,
          gap: compact ? theme.spacing.md : theme.spacing.lg,
        }}
      >
        {groups.map((group) => (
          <View key={group.label} style={{ gap: theme.spacing.xs }}>
            {!compact ? (
              <VadText
                variant="caption"
                tone="tertiary"
                style={{ paddingHorizontal: theme.spacing.sm }}
              >
                {group.label.toUpperCase()}
              </VadText>
            ) : null}

            <View style={{ gap: 2 }}>
              {group.items.map((item) => {
                const selected = isAdminItemSelected(pathname, item.href);

                return (
                  <Pressable
                    key={item.href}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={item.label}
                    onPress={() => router.replace(item.href)}
                    style={({ pressed }) => ({
                      minHeight: compact ? 48 : 46,
                      borderRadius: theme.radius.md,
                      paddingHorizontal: compact
                        ? theme.spacing.xs
                        : theme.spacing.sm,
                      alignItems: compact ? 'center' : 'flex-start',
                      justifyContent: 'center',
                      backgroundColor: selected
                        ? theme.colors.brandSoft
                        : pressed
                          ? theme.colors.surfaceRaised
                          : 'transparent',
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <VadText
                      variant={compact ? 'caption' : 'bodyStrong'}
                      tone={selected ? 'brand' : 'primary'}
                      numberOfLines={1}
                    >
                      {compact ? item.shortLabel : item.label}
                    </VadText>
                    {!compact && selected ? (
                      <VadText
                        variant="caption"
                        tone="secondary"
                        numberOfLines={1}
                      >
                        {item.description}
                      </VadText>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Return to VAD app"
        onPress={onExit}
        style={({ pressed }) => ({
          minHeight: 58,
          margin: compact ? theme.spacing.sm : theme.spacing.md,
          paddingHorizontal: theme.spacing.sm,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          alignItems: compact ? 'center' : 'flex-start',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <VadText variant="caption" tone="secondary">
          {compact ? 'App' : '← Back to VAD app'}
        </VadText>
      </Pressable>
    </View>
  );
}
