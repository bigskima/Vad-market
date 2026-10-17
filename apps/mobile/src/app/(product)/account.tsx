import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadIcon, type VadIconName } from '@/components/ui/vad-icon';
import { VadProgressiveSection } from '@/components/ui/vad-progressive-section';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadText } from '@/components/ui/vad-text';
import { ProductRoute } from '@/features/navigation/product-route';
import { TourTarget } from '@/features/tour/tour-provider';
import { useProductDensity } from '@/hooks/use-product-density';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { getAdminAccess } from '@/services/admin-control-api';

export default function AccountScreen() {
  const { session, signOut } = useAuth();
  const theme = useVadTheme();
  const density = useProductDensity();
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const userId = session?.user.id ?? null;
  const email = session?.user.email ?? session?.user.phone ?? 'VAD member';
  const displayName = typeof session?.user.user_metadata?.display_name === 'string'
    ? session.user.user_metadata.display_name.trim()
    : '';
  const identity = displayName || email;
  const initial = identity.trim().charAt(0).toUpperCase() || 'V';
  const appearance = theme.preference === 'system'
    ? `System · currently ${theme.mode}`
    : theme.preference.charAt(0).toUpperCase() + theme.preference.slice(1);
  const wide = density.width >= 860;

  useEffect(() => {
    let ignore = false;
    const timer = setTimeout(() => {
      if (!userId) {
        setHasAdminAccess(false);
        return;
      }

      void getAdminAccess()
        .then((access) => {
          if (!ignore) setHasAdminAccess(access.isSuperAdmin || access.roles.length > 0);
        })
        .catch(() => {
          if (!ignore) setHasAdminAccess(false);
        });
    }, 0);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [userId]);

  return (
    <ProductRoute active="Account">
      <View style={{ gap: density.sectionGap }}>
        <VadSectionHeader
          title="Account"
        />

        <VadCard variant="brand" style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <View style={{ width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
              <VadText variant="title" tone="brand">{initial}</VadText>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <VadText variant="heading" numberOfLines={1}>{displayName || 'Welcome to VAD'}</VadText>
              <VadText variant="caption" tone="secondary" numberOfLines={1}>{email}</VadText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: hasAdminAccess ? theme.colors.brandPrimary : theme.colors.yes }} />
                <VadText variant="caption" tone="secondary">{hasAdminAccess ? 'Admin account' : 'Member account'} · {appearance}</VadText>
              </View>
            </View>
          </View>
          <VadButton label="Manage profile" variant="secondary" onPress={() => router.push('/account/profile')} />
        </VadCard>

        <View style={{ gap: theme.spacing.sm }}>
          <VadSectionHeader
            title="Quick actions"
          />
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.sm }}>
            <TourTarget id="account-verification">
              <EssentialAction
                icon="operations"
                title="Verification"
                body="Check your verification status."
                onPress={() => router.push('/account/verification')}
              />
            </TourTarget>

            <TourTarget id="account-funding">
              <EssentialAction
                icon="wallet"
                title="Funding"
                body="Deposits, withdrawals and limits."
                onPress={() => router.push('/account/funding')}
              />
            </TourTarget>

          </View>
        </View>

        <VadProgressiveSection
          title="Profile & experience"
          icon="account"
          summary={<VadText variant="caption" tone="tertiary">Profile · Rewards · Appearance</VadText>}
        >
          <SettingsList>
            <AccountRow
              icon="account"
              title="Public profile"
              subtitle="Name, username, photo, banner and bio"
              onPress={() => router.push('/account/profile')}
            />
            <AccountRow
              icon="community"
              title="Rewards & campaigns"
              subtitle="Invite code, campaigns, challenges and reward history"
              onPress={() => router.push('/account/growth')}
            />
            <AccountRow
              icon="markets"
              title="Appearance"
              subtitle={appearance}
              onPress={() => router.push('/account/appearance')}
            />
          </SettingsList>
        </VadProgressiveSection>

        <VadProgressiveSection
          title="Safety, legal & access"
          icon="operations"
          summary={<VadText variant="caption" tone="tertiary">Policies{hasAdminAccess ? ' · Admin' : ''}</VadText>}
        >
          <SettingsList>
            <AccountRow
              icon="operations"
              title="Policies & privacy"
              subtitle="Terms and privacy"
              onPress={() => router.push('/account/policies')}
            />
            {hasAdminAccess ? (
              <AccountRow
                icon="operations"
                title="Admin operations"
                subtitle="Operations dashboard"
                onPress={() => router.push('/admin')}
              />
            ) : null}
          </SettingsList>
        </VadProgressiveSection>

        <View style={{ alignItems: density.phone ? 'stretch' : 'flex-start' }}>
          <VadButton label="Sign out" variant="ghost" fullWidth={density.phone} onPress={() => void signOut()} />
        </View>
      </View>
    </ProductRoute>
  );
}

function EssentialAction({
  icon,
  title,
  body,
  onPress,
}: {
  icon: VadIconName;
  title: string;
  body: string;
  onPress: () => void;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={body}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.76 : 1 })}
    >
      <VadCard variant="surface" style={{ minHeight: 56, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandSoft }}>
          <VadIcon name={icon} size={16} tone="brand" />
        </View>
        <VadText variant="bodyStrong" style={{ flex: 1 }}>{title}</VadText>
        <VadIcon name="chevronRight" size={15} tone="tertiary" />
      </VadCard>
    </Pressable>
  );
}

function SettingsList({ children }: { children: ReactNode }) {
  const theme = useVadTheme();
  return <View style={{ gap: theme.spacing.sm }}>{children}</View>;
}

function AccountRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: VadIconName;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.992 : 1 }] })}
    >
      <View style={{ minHeight: density.phone ? 58 : 64, paddingVertical: theme.spacing.sm, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceMuted }}>
          <VadIcon name={icon} size={18} tone="secondary" />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <VadText variant="bodyStrong">{title}</VadText>
          <VadText variant="caption" tone="secondary" numberOfLines={1}>{subtitle}</VadText>
        </View>
        <VadIcon name="chevronRight" size={17} tone="tertiary" />
      </View>
    </Pressable>
  );
}
