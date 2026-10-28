import { router, usePathname } from 'expo-router';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VadIcon, type VadIconName } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

type MenuEntry = {
  label: string;
  description?: string;
  route: string;
  icon: VadIconName;
};

const sections: { title: string; entries: MenuEntry[] }[] = [
  {
    title: 'EXPLORE VAD',
    entries: [
      { label: 'Home', description: 'Your personal market dashboard', route: '/home', icon: 'home' },
      { label: 'Markets', description: 'Search and browse markets', route: '/markets', icon: 'markets' },
      { label: 'Watchlist', description: 'Markets you have saved', route: '/watchlist', icon: 'bookmark' },
      { label: 'VAD Play', description: 'Published games and prize experiences', route: '/play', icon: 'circlePlay' },
      { label: 'News & headlines', route: '/news', icon: 'fileText' },
      { label: 'Community', description: 'Posts and market discussion', route: '/community', icon: 'community' },
      { label: 'VAD Assistant', route: '/assistant', icon: 'activity' },
    ],
  },
  {
    title: 'WALLET & ACTIVITY',
    entries: [
      { label: 'Wallet', description: 'Balances and payment actions', route: '/wallet', icon: 'wallet' },
      { label: 'Wallet activity', route: '/wallet/activity', icon: 'transfer' },
      { label: 'Portfolio', description: 'Positions, holdings and orders', route: '/portfolio', icon: 'portfolio' },
      { label: 'Notifications', route: '/notifications', icon: 'bell' },
    ],
  },
  {
    title: 'YOUR ACCOUNT',
    entries: [
      { label: 'Account overview', route: '/account', icon: 'account' },
      { label: 'Profile', route: '/account/profile', icon: 'account' },
      { label: 'Identity verification', route: '/account/verification', icon: 'shieldCheck' },
      { label: 'Funding & withdrawals', route: '/account/funding', icon: 'creditCard' },
      { label: 'Rewards & referrals', route: '/referrals', icon: 'activity' },
      { label: 'Security', route: '/account/security', icon: 'lock' },
      { label: 'Appearance', route: '/account/appearance', icon: 'palette' },
      { label: 'Region & availability', route: '/account/region', icon: 'globe' },
      { label: 'Policies & privacy', route: '/account/policies', icon: 'fileText' },
      { label: 'About VAD', route: '/account/about', icon: 'info' },
      { label: 'Get support', route: '/support', icon: 'lifeBuoy' },
    ],
  },
];

export function ProductMenuModal({
  visible,
  onClose,
  onStartTour,
  isAdmin = false,
  canCreate = false,
}: {
  visible: boolean;
  onClose: () => void;
  onStartTour: () => void;
  isAdmin?: boolean;
  canCreate?: boolean;
}) {
  const theme = useVadTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { width, height } = useWindowDimensions();

  const openRoute = (route: string) => {
    onClose();
    if (pathname !== route) router.push(route as never);
  };

  const optionalEntries: MenuEntry[] = [
    ...(canCreate ? [{ label: 'Create market', description: 'Propose a new market', route: '/create-market', icon: 'plus' as const }] : []),
    ...(isAdmin ? [
      { label: 'Admin workspace', description: 'Platform operations and controls', route: '/admin', icon: 'operations' as const },
      { label: 'VAD Play operations', description: 'Manage Play catalogue and campaign reviews', route: '/admin/play', icon: 'circlePlay' as const },
    ] : []),
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(5, 8, 17, 0.62)' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          onPress={onClose}
          style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
        />
        <View
          accessibilityViewIsModal
          style={{
            width: width >= 720 ? Math.min(width - 48, 560) : '100%',
            maxHeight: Math.min(height - Math.max(insets.top, 12), 780),
            alignSelf: 'center',
            borderTopLeftRadius: theme.radius.xxl,
            borderTopRightRadius: theme.radius.xxl,
            borderBottomLeftRadius: width >= 720 ? theme.radius.xxl : 0,
            borderBottomRightRadius: width >= 720 ? theme.radius.xxl : 0,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            paddingTop: theme.spacing.md,
            paddingHorizontal: theme.spacing.md,
            paddingBottom: Math.max(insets.bottom, theme.spacing.md),
            gap: theme.spacing.md,
            marginBottom: width >= 720 ? Math.max(insets.bottom, 24) : 0,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: theme.radius.lg,
                borderWidth: 1,
                borderColor: theme.colors.brandPrimary,
                backgroundColor: theme.colors.brandSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <VadIcon name="menu" size={20} tone="brand" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <VadText variant="heading">VAD menu</VadText>
              <VadText variant="caption" tone="secondary">Everything important, one tap away.</VadText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close menu"
              onPress={onClose}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: theme.colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? theme.colors.surfaceRaised : 'transparent',
              })}
            >
              <VadIcon name="close" size={18} tone="secondary" />
            </Pressable>
          </View>

          <ScrollView
            style={{ flexShrink: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.sm }}
            keyboardShouldPersistTaps="handled"
          >
            {sections.map((section) => (
              <View key={section.title} style={{ gap: theme.spacing.xs }}>
                <VadText variant="caption" tone="tertiary" style={{ letterSpacing: 1.1, fontWeight: '800' }}>
                  {section.title}
                </VadText>
                <View style={{ gap: 4 }}>
                  {section.entries.map((entry) => {
                    const selected = pathname === entry.route || (entry.route !== '/home' && pathname.startsWith(entry.route + '/'));
                    return (
                      <MenuRow
                        key={entry.route}
                        entry={entry}
                        selected={selected}
                        onPress={() => openRoute(entry.route)}
                      />
                    );
                  })}
                </View>
              </View>
            ))}

            {optionalEntries.length > 0 ? (
              <View style={{ gap: theme.spacing.xs }}>
                <VadText variant="caption" tone="tertiary" style={{ letterSpacing: 1.1, fontWeight: '800' }}>WORKSPACES</VadText>
                <View style={{ gap: 4 }}>
                  {optionalEntries.map((entry) => (
                    <MenuRow key={entry.route} entry={entry} selected={pathname === entry.route} onPress={() => openRoute(entry.route)} />
                  ))}
                </View>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start the VAD guided tour"
              onPress={onStartTour}
              style={({ pressed }) => ({
                minHeight: 52,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                paddingHorizontal: theme.spacing.md,
                borderRadius: theme.radius.lg,
                backgroundColor: pressed ? theme.colors.brandSoft : theme.colors.surfaceRaised,
                borderWidth: 1,
                borderColor: theme.colors.border,
              })}
            >
              <VadIcon name="activity" size={20} tone="brand" />
              <View style={{ flex: 1, gap: 2 }}>
                <VadText variant="bodyStrong">Take the guided tour</VadText>
                <VadText variant="caption" tone="secondary">Walk through the main VAD features</VadText>
              </View>
              <VadIcon name="chevronRight" size={17} tone="tertiary" />
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function MenuRow({
  entry,
  selected,
  onPress,
}: {
  entry: MenuEntry;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={entry.label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: entry.description ? 54 : 46,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 7,
        borderRadius: theme.radius.lg,
        borderWidth: selected ? 1 : 0,
        borderColor: selected ? theme.colors.brandPrimary : 'transparent',
        backgroundColor: selected ? theme.colors.brandSoft : pressed ? theme.colors.surfaceRaised : 'transparent',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{ width: 36, height: 36, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? theme.colors.surface : theme.colors.surfaceRaised }}>
        <VadIcon name={entry.icon} size={18} tone={selected ? 'brand' : 'secondary'} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: entry.description ? 2 : 0 }}>
        <VadText variant="bodyStrong" tone={selected ? 'brand' : 'primary'}>{entry.label}</VadText>
        {entry.description ? <VadText variant="caption" tone="secondary" numberOfLines={1}>{entry.description}</VadText> : null}
      </View>
      <VadIcon name="chevronRight" size={15} tone="tertiary" />
    </Pressable>
  );
}
