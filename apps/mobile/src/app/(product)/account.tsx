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
          subtitle="Identity, access and preferences."
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingBottom: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandSoft }}>
            <VadText variant="heading" tone="brand">{initial}</VadText>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <VadText variant="bodyStrong" numberOfLines={1}>{displayName || 'Your VAD account'}</VadText>
            <VadText variant="caption" tone="secondary" numberOfLines={1}>{email}</VadText>
            <VadText variant="caption" tone="tertiary" numberOfLines={1}>{displayName ? 'Profile ready' : 'Complete profile'} · {appearance} · {hasAdminAccess ? 'Admin' : 'Member'}</VadText>
          </View>
          <VadButton label="Edit" variant="secondary" size="small" fullWidth={false} onPress={() => router.push('/account/profile')} />
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <VadSectionHeader
            title="Account essentials"
            subtitle="Your most-used account actions."
          />
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.sm }}>
            <TourTarget id="account-verification">
              <EssentialAction
                icon="operations"
                eyebrow="IDENTITY"
                title="Verification"
                body="Check your verification status."
                onPress={() => router.push('/account/verification')}
              />
            </TourTarget>

            <TourTarget id="account-funding">
              <EssentialAction
                icon="wallet"
                eyebrow="MONEY"
                title="Funding"
                body="Deposits, withdrawals and limits."
                onPress={() => router.push('/account/funding')}
              />
            </TourTarget>

            <TourTarget id="account-guidance">
              <EssentialAction
                icon="activity"
                eyebrow="GUIDANCE"
                title="VAD tour"
                body="Quick product walkthrough."
                onPress={() => router.push('/account/app-tour')}
              />
            </TourTarget>
          </View>
        </View>

        <VadProgressiveSection
          title="Profile & experience"
          eyebrow="PERSONALISE VAD"
          description="Profile, rewards and appearance."
          icon="account"
          defaultExpanded
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
          eyebrow="ACCOUNT CONTROLS"
          description="Privacy, policies and admin access."
          icon="operations"
          summary={<VadText variant="caption" tone="tertiary">Policies{hasAdminAccess ? ' · Admin' : ''}</VadText>}
        >
          <SettingsList>
            <AccountRow
              icon="operations"
              title="Policies & privacy"
              subtitle="Terms, privacy information and important notices"
              onPress={() => router.push('/account/policies')}
            />
            {hasAdminAccess ? (
              <AccountRow
                icon="operations"
                title="Admin operations"
                subtitle="Open the VAD operations dashboard with your assigned access"
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
  eyebrow,
  title,
  body,
  onPress,
}: {
  icon: VadIconName;
  eyebrow: string;
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
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.76 : 1, transform: [{ scale: pressed ? 0.992 : 1 }] })}
    >
      <VadCard variant="surface" style={{ minHeight: 76, paddingVertical: theme.spacing.sm, gap: theme.spacing.xs }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandSoft }}>
          <VadIcon name={icon} size={16} tone="brand" />
        </View>
        <View style={{ gap: 2 }}>
          <VadText variant="caption" tone="brand">{eyebrow}</VadText>
          <VadText variant="bodyStrong">{title}</VadText>
          <VadText variant="caption" tone="secondary">{body}</VadText>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 3, marginTop: 'auto' }}>
          <VadText variant="caption" tone="brand">Open</VadText>
          <VadIcon name="chevronRight" size={14} tone="brand" />
        </View>
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
      <VadCard
        variant="raised"
        style={{
          minHeight: density.phone ? 74 : 82,
          paddingVertical: theme.spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
        }}
      >
        <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandSoft }}>
          <VadIcon name={icon} size={19} tone="brand" />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <VadText variant="bodyStrong">{title}</VadText>
          <VadText variant="caption" tone="secondary">{subtitle}</VadText>
        </View>
        <VadIcon name="chevronRight" size={18} tone="tertiary" />
      </VadCard>
    </Pressable>
  );
}
