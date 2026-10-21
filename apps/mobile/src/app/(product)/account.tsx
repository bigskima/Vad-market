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
import { useCurrencyPreference } from '@/providers/currency-preference-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { getAdminAccess } from '@/services/admin-control-api';

export default function AccountScreen() {
  const { session, signOut } = useAuth();
  const currencyPreference = useCurrencyPreference();
  const { refreshPortfolio } = useProductDataContext();
  const tngnEnabled = currencyPreference.isCurrencyEnabled('TNGN');
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

  useEffect(() => {
    if (currencyPreference.loading || !userId) return;
    void refreshPortfolio();
  }, [currencyPreference.loading, refreshPortfolio, tngnEnabled, userId]);

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
      <View style={{ gap: density.phone ? 14 : density.sectionGap }}>
        <View style={{ gap: 3 }}>
          <VadText variant="title">Account</VadText>
          <VadText variant="caption" tone="secondary">Profile, settings and access</VadText>
        </View>

        <VadCard variant="brand" style={{ padding: density.phone ? 18 : theme.spacing.xl, gap: theme.spacing.md, borderRadius: 26, borderWidth: 1, borderColor: theme.colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <View style={{ width: 60, height: 60, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandSoft, borderWidth: 1, borderColor: theme.colors.border }}>
              <VadText variant="title" tone="brand">{initial}</VadText>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
              <VadText variant="heading" numberOfLines={1}>{displayName || 'Welcome to VAD'}</VadText>
              <VadText variant="caption" tone="secondary" numberOfLines={1}>{email}</VadText>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.colors.surface, borderRadius: theme.radius.pill, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: hasAdminAccess ? theme.colors.brandPrimary : theme.colors.yes }} />
                  <VadText variant="caption" tone="secondary">{hasAdminAccess ? 'Admin' : 'Member'}</VadText>
                </View>
                <VadText variant="caption" tone="secondary">{appearance} mode</VadText>
              </View>
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Manage profile" onPress={() => router.push('/account/profile')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, opacity: pressed ? 0.75 : 1 })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <VadIcon name="account" size={17} tone="brand" />
              <VadText variant="bodyStrong" tone="brand">Edit profile</VadText>
            </View>
            <VadIcon name="chevronRight" size={17} tone="brand" />
          </Pressable>
        </VadCard>

        <View style={{ gap: theme.spacing.sm }}>
          <VadSectionHeader
            title="Shortcuts"
          />
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
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
                body="Deposits, withdrawals and limits"
                onPress={() => router.push('/account/funding')}
              />
            </TourTarget>

          </View>
        </View>

        <VadProgressiveSection
          title="Trading currencies"
          icon="markets"
          summary={<VadText variant="caption" tone="tertiary">Choose which eligible currencies appear in trading</VadText>}
        >
          <SettingsList>
            {currencyPreference.isCurrencyEligible('TNGN') ? (
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="Enable TNGN trading"
                accessibilityState={{ checked: currencyPreference.isCurrencyEnabled('TNGN'), disabled: currencyPreference.loading }}
                disabled={currencyPreference.loading}
                onPress={() => currencyPreference.toggleCurrency('TNGN')}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, opacity: pressed ? 0.75 : 1 })}
              >
                <View style={{ flex: 1, gap: 3, paddingRight: 12 }}>
                  <VadText variant="bodyStrong">TNGN demo trading</VadText>
                  <VadText variant="caption" tone="secondary">Trade TNGN in the same Markets, Wallet, and Portfolio screens. Its demo ledger stays isolated from real NGN and USDC.</VadText>
                </View>
                <View style={{ width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center', alignItems: currencyPreference.isCurrencyEnabled('TNGN') ? 'flex-end' : 'flex-start', backgroundColor: currencyPreference.isCurrencyEnabled('TNGN') ? theme.colors.brandPrimary : theme.colors.border }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.surface }} />
                </View>
              </Pressable>
            ) : (
              <View style={{ padding: 12, gap: 3 }}>
                <VadText variant="bodyStrong">TNGN unavailable</VadText>
                <VadText variant="caption" tone="secondary">TNGN has not been enabled for this account by the platform configuration.</VadText>
              </View>
            )}
          </SettingsList>
        </VadProgressiveSection>

        <VadProgressiveSection
          title="Personalize"
          icon="account"
          summary={<VadText variant="caption" tone="tertiary">Profile · Rewards · Appearance</VadText>}
        >
          <SettingsList>
            <AccountRow
              icon="account"
              title="Public profile"
              subtitle="Name, username and profile photo"
              onPress={() => router.push('/account/profile')}
            />
            <AccountRow
              icon="community"
              title="Rewards & campaigns"
              subtitle="Invites and reward history"
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
          title="Security & access"
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
      <VadCard variant="surface" style={{ minHeight: 88, paddingHorizontal: 13, paddingVertical: 13, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border }}>
        <View style={{ width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandSoft }}>
          <VadIcon name={icon} size={17} tone="brand" />
        </View>
        <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
          <VadText variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{title}</VadText>
          <VadIcon name="chevronRight" size={15} tone="tertiary" />
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
