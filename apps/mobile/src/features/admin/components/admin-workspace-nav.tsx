import { router, usePathname } from 'expo-router';
import {
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useAdminData } from '@/providers/admin-data-provider';
import { hasAnyAdminPermission } from '@/services/admin-control-api';
import { useVadTheme } from '@/providers/theme-provider';

const sections = [
  { label: 'Overview', short: 'Overview', href: '/admin', permissions: [] },
  {
    label: 'Governance',
    short: 'Governance',
    href: '/admin/governance',
    permissions: ['markets.manage', 'oracle.review'],
  },
  {
    label: 'Providers',
    short: 'Providers',
    href: '/admin/providers',
    permissions: ['providers.manage', 'finance.read'],
  },
  {
    label: 'Compliance',
    short: 'KYC',
    href: '/admin/compliance',
    permissions: ['compliance.manage', 'support.read'],
  },
  {
    label: 'Payments',
    short: 'Payments',
    href: '/admin/payments',
    permissions: ['finance.read', 'payments.refund'],
  },
  {
    label: 'Users',
    short: 'Users',
    href: '/admin/users',
    permissions: ['users.manage', 'support.read', 'admin.roles.manage'],
  },
  {
    label: 'Content',
    short: 'Content',
    href: '/admin/content',
    permissions: ['content.moderate'],
  },
  {
    label: 'Roles',
    short: 'Roles',
    href: '/admin/roles',
    permissions: ['admin.roles.manage'],
  },
] as const;

export function AdminWorkspaceNav() {
  const theme = useVadTheme();
  const data = useAdminData();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const compact = width < 380;
  const visibleSections = sections.filter(
    (section) =>
      section.permissions.length === 0 ||
      hasAnyAdminPermission(data.access, [...section.permissions]),
  );

  return (
    <View
      accessibilityRole="tablist"
      style={{
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
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: desktop
              ? theme.spacing.xl
              : compact
                ? theme.spacing.md
                : theme.spacing.lg,
            gap: desktop ? theme.spacing.xl : theme.spacing.md,
          }}
        >
          {visibleSections.map((section) => {
            const selected =
              section.href === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(section.href);

            return (
              <Pressable
                key={section.href}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={section.label + ' operations'}
                onPress={() => router.replace(section.href)}
                style={({ pressed }) => ({
                  minHeight: desktop ? 50 : 46,
                  minWidth: desktop ? 82 : undefined,
                  alignItems: desktop ? 'center' : 'flex-start',
                  justifyContent: 'center',
                  borderBottomWidth: 2,
                  borderBottomColor: selected
                    ? theme.colors.brandPrimary
                    : 'transparent',
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                <VadText
                  variant={desktop ? 'label' : 'caption'}
                  tone={selected ? 'brand' : 'secondary'}
                >
                  {compact ? section.short : section.label}
                </VadText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
