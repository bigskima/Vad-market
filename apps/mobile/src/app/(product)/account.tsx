import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadIcon, type VadIconName } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { ProductRoute } from '@/features/navigation/product-route';
import { useProductDensity } from '@/hooks/use-product-density';
import { useAuth } from '@/providers/auth-provider';
import { useCurrencyPreference } from '@/providers/currency-preference-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import type { VadThemePreference } from '@/theme/tokens';
import { getAdminAccess } from '@/services/admin-control-api';
import { getMyProfile, profileMediaUrl, type UserProfile } from '@/services/profile-api';

export default function AccountScreen() {
  const { session, signOut } = useAuth();
  const currencyPreference = useCurrencyPreference();
  const { refreshPortfolio } = useProductDataContext();
  const tngnEnabled = currencyPreference.isCurrencyEnabled('TNGN');
  const theme = useVadTheme();
  const density = useProductDensity();
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [savedProfile, setSavedProfile] = useState<UserProfile | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const user = session?.user;
  const userId = user?.id ?? null;
  const email = user?.email ?? user?.phone ?? 'Contact information unavailable';
  const metadata = user?.user_metadata ?? {};
  const metadataName = typeof metadata.display_name === 'string' ? metadata.display_name.trim()
    : typeof metadata.full_name === 'string' ? metadata.full_name.trim() : '';
  const displayName = savedProfile?.display_name?.trim() || metadataName;
  const metadataAvatar = typeof metadata.avatar_url === 'string' ? metadata.avatar_url
    : typeof metadata.picture === 'string' ? metadata.picture : null;
  const avatarUrl = profileMediaUrl(savedProfile?.avatar_path) || metadataAvatar;
  const country = typeof metadata.country === 'string' ? metadata.country
    : typeof metadata.country_name === 'string' ? metadata.country_name : null;
  const appearance = theme.preference === 'system' ? `System · ${theme.mode}`
    : theme.preference.charAt(0).toUpperCase() + theme.preference.slice(1);

  useEffect(() => {
    if (!userId || currencyPreference.loading) return;
    void refreshPortfolio();
  }, [currencyPreference.loading, refreshPortfolio, tngnEnabled, userId]);

  useEffect(() => {
    let ignore = false;
    if (!userId) { setSavedProfile(null); return; }
    void getMyProfile().then((profile) => { if (!ignore) setSavedProfile(profile); }).catch(() => { if (!ignore) setSavedProfile(null); });
    return () => { ignore = true; };
  }, [userId]);

  useEffect(() => {
    let ignore = false;
    if (!userId) { setHasAdminAccess(false); return; }
    void getAdminAccess().then((access) => {
      if (!ignore) setHasAdminAccess(access.isSuperAdmin || access.roles.length > 0);
    }).catch(() => { if (!ignore) setHasAdminAccess(false); });
    return () => { ignore = true; };
  }, [userId]);

  const requestSignOut = () => {
    Alert.alert('Log out of VAD Market?', 'You will need to sign in again to access your account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => {
        setSigningOut(true);
        void signOut().catch(() => {
          Alert.alert('Could not log out', 'Please try again.');
        }).finally(() => setSigningOut(false));
      } },
    ]);
  };

  return (
    <ProductRoute active="Account">
      <View style={{ gap: density.phone ? 12 : 16, paddingBottom: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <VadText variant="title">Account</VadText>
            <VadText variant="caption" tone="secondary">Manage your profile, security and app preferences.</VadText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => router.push('/notifications')} style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 })}>
            <VadIcon name="bell" size={21} tone="primary" />
          </Pressable>
        </View>

        <VadCard variant="surface" style={{ padding: density.phone ? 13 : 18, borderRadius: 19, borderWidth: 1, borderColor: theme.colors.border, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 66, height: 66, borderRadius: 33, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandSoft, borderWidth: 1, borderColor: theme.colors.border }}>
              {avatarUrl ? <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <VadText variant="title" tone="brand">{(displayName || email).trim().charAt(0).toUpperCase() || 'V'}</VadText>}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <VadText variant="heading" numberOfLines={1}>{displayName || 'VAD Market member'}</VadText>
              <VadText variant="caption" tone="secondary" numberOfLines={1}>{email}</VadText>
              <VadText variant="caption" tone="secondary" numberOfLines={1}>{country || 'Country not set'}</VadText>
            </View>
          </View>
          <ActionButton label="Edit Profile" onPress={() => router.push('/account/profile')} />
        </VadCard>

        <Pressable accessibilityRole="button" accessibilityLabel="View identity verification details" onPress={() => router.push('/account/verification')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, opacity: pressed ? 0.75 : 1 })}>
          <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandSoft }}>
            <VadIcon name="operations" size={22} tone="brand" />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <VadText variant="bodyStrong">Verification status</VadText>
            <VadText variant="caption" tone="secondary">View your actual identity-verification status and next steps.</VadText>
          </View>
          <VadText variant="caption" tone="brand">View</VadText>
        </Pressable>

        <SettingsGroup title="Account">
          <AccountRow icon="account" title="Personal Information" subtitle="Name, email and profile details" onPress={() => router.push('/account/profile')} />
          <AccountRow icon="operations" title="Verification (KYC)" subtitle="Identity verification and documents" onPress={() => router.push('/account/verification')} />
          <AccountRow icon="wallet" title="Payment Methods" subtitle="Deposits, withdrawals and available payment options" onPress={() => router.push('/account/funding')} last />
        </SettingsGroup>

        <SettingsGroup title="Security">
          <AccountRow icon="operations" title="Additional security controls" subtitle="Password, PIN, two-factor and session management are not yet exposed in this app build." />
          <AccountRow icon="account" title="Policies & privacy" subtitle="Terms and privacy information" onPress={() => router.push('/account/policies')} last />
        </SettingsGroup>

        <SettingsGroup title="Preferences">
          <AccountRow icon="bell" title="Notifications" subtitle="Trade alerts, results and account activity" onPress={() => router.push('/notifications')} />
          <View style={{ paddingHorizontal: 12, paddingVertical: 12, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <IconTile icon="markets" />
              <View style={{ flex: 1, gap: 2 }}>
                <VadText variant="bodyStrong">App Appearance</VadText>
                <VadText variant="caption" tone="secondary">{appearance}</VadText>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 7 }}>
              {(['dark', 'light', 'system'] as VadThemePreference[]).map((preference) => (
                <Pressable key={preference} accessibilityRole="button" accessibilityState={{ selected: theme.preference === preference }} onPress={() => theme.setPreference(preference)} style={({ pressed }) => ({ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: theme.preference === preference ? theme.colors.brandSoft : theme.colors.surfaceMuted, borderWidth: 1, borderColor: theme.preference === preference ? theme.colors.brandPrimary : theme.colors.border, opacity: pressed ? 0.75 : 1 })}>
                  <VadText variant="caption" tone={theme.preference === preference ? 'brand' : 'secondary'}>{preference === 'system' ? 'System' : preference === 'dark' ? 'Dark' : 'Light'}</VadText>
                </Pressable>
              ))}
            </View>
          </View>
          {currencyPreference.isCurrencyEligible('TNGN') ? (
            <View style={{ paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <IconTile icon="wallet" />
              <View style={{ flex: 1, gap: 2 }}>
                <VadText variant="bodyStrong">TNGN demo trading</VadText>
                <VadText variant="caption" tone="secondary">Separate practice ledger; real NGN and USDC remain unaffected.</VadText>
              </View>
              <Pressable accessibilityRole="switch" accessibilityLabel="Enable TNGN demo trading" accessibilityState={{ checked: currencyPreference.isCurrencyEnabled('TNGN'), disabled: currencyPreference.loading }} disabled={currencyPreference.loading} onPress={() => currencyPreference.toggleCurrency('TNGN')} style={{ width: 43, height: 25, borderRadius: 13, padding: 3, justifyContent: 'center', alignItems: currencyPreference.isCurrencyEnabled('TNGN') ? 'flex-end' : 'flex-start', backgroundColor: currencyPreference.isCurrencyEnabled('TNGN') ? theme.colors.brandPrimary : theme.colors.border }}>
                <View style={{ width: 19, height: 19, borderRadius: 10, backgroundColor: theme.colors.surface }} />
              </Pressable>
            </View>
          ) : null}
          <AccountRow icon="markets" title="Language & Region" subtitle="Regional and language controls are not configured yet." last />
        </SettingsGroup>

        <SettingsGroup title="Support">
          <AccountRow icon="community" title="Help & Support" subtitle="A support destination has not been configured yet." />
          <AccountRow icon="operations" title="Terms & Policies" subtitle="Open the currently published legal documents" onPress={() => router.push('/account/policies')} />
          <AccountRow icon="activity" title="About VAD Market" subtitle="App version and company information are not configured on this screen." last />
        </SettingsGroup>

        {hasAdminAccess ? (
          <SettingsGroup title="Administration">
            <AccountRow icon="operations" title="Admin operations" subtitle="Operations dashboard" onPress={() => router.push('/admin')} last />
          </SettingsGroup>
        ) : null}

        <Pressable accessibilityRole="button" accessibilityLabel="Log out" disabled={signingOut} onPress={requestSignOut} style={({ pressed }) => ({ minHeight: 45, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.no, backgroundColor: theme.colors.noSoft, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: pressed || signingOut ? 0.65 : 1 })}>
          <VadIcon name="close" size={17} tone="no" />
          <VadText variant="bodyStrong" tone="no">{signingOut ? 'Logging out…' : 'Log Out'}</VadText>
        </Pressable>
      </View>
    </ProductRoute>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const theme = useVadTheme();
  return (
    <View style={{ gap: 7 }}>
      <VadText variant="bodyStrong">{title}</VadText>
      <VadCard variant="surface" style={{ paddingHorizontal: 12, paddingVertical: 2, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, gap: 0 }}>
        {children}
      </VadCard>
    </View>
  );
}

function IconTile({ icon }: { icon: VadIconName }) {
  const theme = useVadTheme();
  return <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandSoft }}><VadIcon name={icon} size={17} tone="brand" /></View>;
}

function AccountRow({ icon, title, subtitle, onPress, last = false }: { icon: VadIconName; title: string; subtitle: string; onPress?: () => void; last?: boolean }) {
  const theme = useVadTheme();
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={title} accessibilityHint={subtitle} accessibilityState={{ disabled: !onPress }} disabled={!onPress} onPress={onPress} style={({ pressed }) => ({ minHeight: 61, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, opacity: pressed ? 0.7 : onPress ? 1 : 0.72, borderBottomWidth: last ? 0 : 1, borderBottomColor: theme.colors.border })}>
      <IconTile icon={icon} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <VadText variant="bodyStrong">{title}</VadText>
        <VadText variant="caption" tone="secondary" numberOfLines={2}>{subtitle}</VadText>
      </View>
      {onPress ? <VadIcon name="chevronRight" size={17} tone="tertiary" /> : null}
    </Pressable>
  );
}

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useVadTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.brandPrimary, opacity: pressed ? 0.7 : 1 })}><VadText variant="bodyStrong" tone="brand">{label}</VadText></Pressable>;
}
