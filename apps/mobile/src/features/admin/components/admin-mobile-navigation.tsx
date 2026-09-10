import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadText } from '@/components/ui/vad-text';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getVisibleAdminGroups,
  isAdminItemSelected,
  type AdminHref,
} from './admin-navigation';

const primary: { label: string; href: AdminHref }[] = [
  { label: 'Home', href: '/admin' },
  { label: 'Queue', href: '/admin/queue' },
  { label: 'Search', href: '/admin/search' },
];

export function AdminMobileNavigation() {
  const theme = useVadTheme();
  const data = useAdminData();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [moreOpen, setMoreOpen] = useState(false);
  const groups = getVisibleAdminGroups(data.access).filter(
    (group) => group.label !== 'Command',
  );
  const moreSelected = !primary.some((item) =>
    isAdminItemSelected(pathname, item.href),
  );

  const navigate = (href: AdminHref) => {
    setMoreOpen(false);
    router.replace(href);
  };

  return (
    <>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          minHeight: 58 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, theme.spacing.xs),
          paddingHorizontal: theme.spacing.sm,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          flexDirection: 'row',
          alignItems: 'flex-start',
        }}
      >
        {primary.map((item) => {
          const selected = isAdminItemSelected(pathname, item.href);
          return (
            <MobileNavButton
              key={item.href}
              label={item.label}
              selected={selected}
              onPress={() => navigate(item.href)}
            />
          );
        })}

        <MobileNavButton
          label="More"
          selected={moreSelected || moreOpen}
          onPress={() => setMoreOpen(true)}
        />
      </View>

      <VadBottomSheet
        visible={moreOpen}
        title="VAD Operations"
        onClose={() => setMoreOpen(false)}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: theme.spacing.lg }}
          style={{ maxHeight: 520 }}
        >
          {groups.map((group) => (
            <View key={group.label} style={{ gap: theme.spacing.xs }}>
              <VadText variant="caption" tone="tertiary">
                {group.label.toUpperCase()}
              </VadText>
              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                }}
              >
                {group.items.map((item) => {
                  const selected = isAdminItemSelected(pathname, item.href);
                  return (
                    <Pressable
                      key={item.href}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => navigate(item.href)}
                      style={({ pressed }) => ({
                        minHeight: 62,
                        paddingVertical: theme.spacing.sm,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: theme.spacing.md,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.border,
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <VadText
                          variant="bodyStrong"
                          tone={selected ? 'brand' : 'primary'}
                        >
                          {item.label}
                        </VadText>
                        <VadText
                          variant="caption"
                          tone="secondary"
                          numberOfLines={1}
                        >
                          {item.description}
                        </VadText>
                      </View>
                      <VadText variant="heading" tone="tertiary">›</VadText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </VadBottomSheet>
    </>
  );
}

function MobileNavButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} operations`}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 50,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        opacity: pressed ? 0.55 : 1,
      })}
    >
      <View
        style={{
          width: 26,
          height: 3,
          borderRadius: theme.radius.pill,
          backgroundColor: selected
            ? theme.colors.brandPrimary
            : 'transparent',
        }}
      />
      <VadText
        variant="caption"
        tone={selected ? 'brand' : 'secondary'}
      >
        {label}
      </VadText>
    </Pressable>
  );
}
