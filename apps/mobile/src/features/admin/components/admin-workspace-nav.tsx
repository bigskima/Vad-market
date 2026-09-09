import { router, usePathname } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

const sections = [
  { label: 'Overview', href: '/admin' },
  { label: 'Governance', href: '/admin/governance' },
  { label: 'Providers', href: '/admin/providers' },
  { label: 'Compliance', href: '/admin/compliance' },
  { label: 'Payments', href: '/admin/payments' },
] as const;

export function AdminWorkspaceNav() {
  const theme = useVadTheme();
  const pathname = usePathname();

  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.background,
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          gap: theme.spacing.xs,
        }}
      >
        {sections.map((section) => {
          const selected =
            section.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(section.href);

          return (
            <Pressable
              key={section.href}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => router.replace(section.href)}
              style={({ pressed }) => ({
                minHeight: 44,
                justifyContent: 'center',
                borderBottomWidth: 2,
                borderBottomColor: selected
                  ? theme.colors.brandPrimary
                  : 'transparent',
                paddingHorizontal: theme.spacing.xs,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <VadText
                variant="caption"
                tone={selected ? 'brand' : 'secondary'}
              >
                {section.label}
              </VadText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
