import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Image, Pressable, Switch, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadIcon, type VadIconName } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { ProductRoute } from '@/features/navigation/product-route';
import { useProductDensity } from '@/hooks/use-product-density';
import { useAuth } from '@/providers/auth-provider';
import { useCurrencyPreference } from '@/providers/currency-preference-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { getAdminAccess } from '@/services/admin-control-api';
import { getMyKycStatus, type KycStatus } from '@/services/identity-api';
import { getMyProfile, profileMediaUrl, type UserProfile } from '@/services/profile-api';
import { supabase } from '@/lib/supabase';
import { getTemporaryNgnTestCreditStatus, setTemporaryNgnTestMode, type TemporaryNgnTestCreditStatus } from '@/services/temporary-ngn-test-credit-api';

type UserKycState = { userId: string; status: KycStatus | null };
type UserMfaState = { userId: string; enabled: boolean | null };

export default function AccountScreen() {
  const { session, signOut } = useAuth();
  const data = useProductDataContext();
  const currencyPreference = useCurrencyPreference();
  const theme = useVadTheme();
  const density = useProductDensity();
  const refreshPortfolio = data.refreshPortfolio;
  const user = session?.user;
  const userId = user?.id ?? null;
  const metadata = user?.user_metadata ?? {};
  const email = user?.email ?? user?.phone ?? 'Contact information unavailable';
  const unreadNotificationCount = data.notifications.filter((notification) => !notification.read_at).length;
  const [savedProfile, setSavedProfile] = useState<UserProfile | null>(null);
  const [kycState, setKycState] = useState<UserKycState | null>(null);
  const [mfaState, setMfaState] = useState<UserMfaState | null>(null);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [adminAccessFor, setAdminAccessFor] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [marketTestingStatus, setMarketTestingStatus] = useState<TemporaryNgnTestCreditStatus | null>(null);
  const [marketTestingLoading, setMarketTestingLoading] = useState(true);
  const [marketTestingSaving, setMarketTestingSaving] = useState(false);
  const [marketTestingError, setMarketTestingError] = useState<string | null>(null);

  const metadataName = typeof metadata.display_name === 'string' ? metadata.display_name.trim()
    : typeof metadata.full_name === 'string' ? metadata.full_name.trim() : '';
  const profile = savedProfile?.user_id === userId ? savedProfile : null;
  const displayName = profile?.display_name?.trim() || metadataName || 'VAD Market member';
  const metadataAvatar = typeof metadata.avatar_url === 'string' ? metadata.avatar_url
    : typeof metadata.picture === 'string' ? metadata.picture : null;
  const avatarUrl = profileMediaUrl(profile?.avatar_path) || metadataAvatar;
  const kycStatus = kycState?.userId === userId ? kycState.status : null;
  const mfaEnabled = mfaState?.userId === userId ? mfaState.enabled : null;
  const countryValue = typeof metadata.country === 'string' ? metadata.country
    : typeof metadata.country_name === 'string' ? metadata.country_name : '';
  const contextCountryCode = typeof metadata.country_code === 'string' ? metadata.country_code
    : data.countryCode;
  const countryCode = normalizeCountryCode(contextCountryCode, countryValue);
  const country = countryValue || countryNameFromCode(countryCode) || 'Country not set';
  useEffect(() => {
    if (!userId || currencyPreference.loading) return;
    void refreshPortfolio();
  }, [currencyPreference.loading, refreshPortfolio, userId]);

  useEffect(() => {
    if (!userId) return;
    let ignore = false;
    void getMyProfile().then((next) => {
      if (!ignore) setSavedProfile(next);
    }).catch(() => {
      if (!ignore) setSavedProfile(null);
    });
    void getMyKycStatus().then((status) => {
      if (!ignore) setKycState({ userId, status });
    }).catch(() => {
      if (!ignore) setKycState({ userId, status: null });
    });
    void supabase.auth.mfa.listFactors().then(({ data: factors, error }) => {
      if (ignore) return;
      const enabled = error ? null : (factors?.all ?? []).some((factor) => factor.factor_type === 'totp' && factor.status === 'verified');
      setMfaState({ userId, enabled });
    }).catch(() => {
      if (!ignore) setMfaState({ userId, enabled: null });
    });
    return () => { ignore = true; };
  }, [userId]);

  useEffect(() => {
    let ignore = false;
    if (!userId) {
      setMarketTestingStatus(null);
      setMarketTestingError(null);
      setMarketTestingLoading(false);
      return () => { ignore = true; };
    }
    setMarketTestingLoading(true);
    void getTemporaryNgnTestCreditStatus().then((status) => {
      if (!ignore) {
        setMarketTestingStatus(status);
        setMarketTestingError(null);
      }
    }).catch((reason: unknown) => {
      if (!ignore) {
        setMarketTestingStatus(null);
        setMarketTestingError(reason instanceof Error ? reason.message : 'Market testing settings could not be loaded.');
      }
    }).finally(() => {
      if (!ignore) setMarketTestingLoading(false);
    });
    return () => { ignore = true; };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let ignore = false;
    void getAdminAccess().then((access) => {
      if (!ignore) {
        setHasAdminAccess(access.isSuperAdmin || access.roles.length > 0);
        setAdminAccessFor(userId);
      }
    }).catch(() => {
      if (!ignore) {
        setHasAdminAccess(false);
        setAdminAccessFor(userId);
      }
    });
    return () => { ignore = true; };
  }, [userId]);

  const isVerified = kycStatus?.status === 'VERIFIED';
  const kycCopy = getKycCopy(kycStatus);
  const handleMarketTestingChange = async (enabled: boolean) => {
    if (!marketTestingStatus?.active || marketTestingSaving) return;
    setMarketTestingSaving(true);
    setMarketTestingError(null);
    try {
      const updated = await setTemporaryNgnTestMode(enabled);
      setMarketTestingStatus(updated);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Market testing mode could not be updated.';
      setMarketTestingError(message);
      Alert.alert('Market testing settings unchanged', message);
    } finally {
      setMarketTestingSaving(false);
    }
  };

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
    <ProductRoute active="Account" hideTopBar>
      <View style={{ gap: density.phone ? 7 : 12, paddingBottom: theme.spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1, gap: 1 }}>
            <VadText variant="title">Account</VadText>
            <VadText variant="caption" tone="secondary" style={{ fontSize: density.phone ? 13 : 14, lineHeight: density.phone ? 18 : 19 }}>Manage your profile, security and app preferences.</VadText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={unreadNotificationCount ? `Notifications, ${unreadNotificationCount} unread` : 'Notifications'} onPress={() => router.push('/notifications')} style={({ pressed }) => ({ width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <VadIcon name="bell" size={25} tone="primary" />
            {unreadNotificationCount > 0 ? <View style={{ position: 'absolute', top: 4, right: 3, width: 9, height: 9, borderRadius: 5, backgroundColor: theme.colors.no, borderWidth: 1, borderColor: theme.colors.background }} /> : null}
          </Pressable>
        </View>

        <VadCard style={{ paddingHorizontal: density.phone ? 10 : 14, paddingVertical: density.phone ? 5 : 10, borderRadius: 15, gap: 0, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: density.phone ? 56 : 64, height: density.phone ? 56 : 64, borderRadius: 40, overflow: 'visible', position: 'relative', flexShrink: 0 }}>
              <View style={{ width: '100%', height: '100%', borderRadius: 40, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandSoft, borderWidth: 1, borderColor: theme.colors.borderStrong }}>
                {avatarUrl ? <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <VadText variant="title" tone="brand">{(displayName || email).trim().charAt(0).toUpperCase() || 'V'}</VadText>}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Change profile photo" onPress={() => router.push('/account/profile')} style={({ pressed }) => ({ position: 'absolute', right: -2, bottom: 0, width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                <VadIcon name="camera" size={13} color={theme.colors.info} />
              </Pressable>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <VadText variant="heading" numberOfLines={1}>{displayName}</VadText>
              <VadText variant="caption" tone="secondary" numberOfLines={1}>{email}</VadText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 }}>
                {countryCode ? <VadText variant="caption">{countryFlag(countryCode)}</VadText> : null}
                <VadText variant="caption" tone="secondary" numberOfLines={1}>{country}</VadText>
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit profile" onPress={() => router.push('/account/profile')} style={({ pressed }) => ({ minHeight: 35, paddingHorizontal: density.phone ? 10 : 15, borderRadius: 22, borderWidth: 1, borderColor: theme.colors.brandPrimary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
              <VadText variant="caption" tone="primary" style={{ fontSize: density.phone ? 12 : 13 }}>Edit Profile</VadText>
            </Pressable>
          </View>
        </VadCard>

        <Pressable accessibilityRole="button" accessibilityLabel="View verification details" onPress={() => router.push('/account/verification')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: density.phone ? 8 : 11, borderRadius: 15, borderWidth: 1, borderColor: isVerified ? theme.colors.yes : kycStatus?.status === 'REJECTED' ? theme.colors.no : theme.colors.border, backgroundColor: isVerified ? theme.colors.yesSoft : theme.colors.surface, opacity: pressed ? 0.78 : 1 })}>
          <View style={{ width: 38, height: 38, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: isVerified ? theme.colors.yesSoft : kycStatus?.status === 'REJECTED' ? theme.colors.noSoft : theme.colors.surfaceMuted, flexShrink: 0 }}>
            <VadIcon name={isVerified ? 'shieldCheck' : 'shield'} size={22} color={isVerified ? theme.colors.yes : kycStatus?.status === 'REJECTED' ? theme.colors.no : theme.colors.textSecondary} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <VadText variant="bodyStrong" style={{ fontSize: density.phone ? 14 : 15 }}>{kycCopy.title}</VadText>
            <VadText variant="caption" tone="secondary" numberOfLines={2} style={{ fontSize: density.phone ? 12 : 13, lineHeight: density.phone ? 16 : 18 }}>{kycCopy.body}</VadText>
          </View>
          <View style={{ borderRadius: 22, borderWidth: 1, borderColor: isVerified ? theme.colors.yes : theme.colors.border, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center', justifyContent: 'center' }}>
            <VadText variant="caption" tone={isVerified ? 'yes' : 'secondary'}>{isVerified ? 'View Details' : 'View Details'}</VadText>
          </View>
        </Pressable>

        <SettingsGroup title="Account">
          <AccountRow icon="account" iconBackground={theme.colors.infoSoft} iconColor={theme.colors.info} title="Personal Information" subtitle="Name, email, phone number, country" onPress={() => router.push('/account/profile')} />
          <AccountRow icon="creditCard" iconBackground={theme.colors.brandSoft} iconColor={theme.colors.brandPrimary} title="Verification (KYC)" subtitle="Identity verification and documents" badge={isVerified ? 'Verified' : undefined} badgeTone="yes" onPress={() => router.push('/account/verification')} />
          <AccountRow icon="wallet" iconBackground={theme.colors.warningSoft} iconColor={theme.colors.warning} title="Payment Methods" subtitle="Linked bank accounts and payment options" onPress={() => router.push('/account/funding')} last />
        </SettingsGroup>

        <SettingsGroup title="Security">
          <AccountRow icon="lock" iconBackground={theme.colors.yesSoft} iconColor={theme.colors.yes} title="Security Settings" subtitle="Password, PIN, biometric login" onPress={() => router.push('/account/security')} />
          <AccountRow icon="shieldCheck" iconBackground={theme.colors.noSoft} iconColor={theme.colors.no} title="Two-Factor Authentication" subtitle="Add an extra layer of security" badge={mfaEnabled === null ? 'Unavailable' : mfaEnabled ? 'Enabled' : 'Not enabled'} badgeTone={mfaEnabled ? 'yes' : 'neutral'} onPress={() => router.push('/account/security')} />
          <AccountRow icon="device" iconBackground={theme.colors.infoSoft} iconColor={theme.colors.info} title="Active Sessions" subtitle="Manage your logged in devices" onPress={() => router.push("/account/security")} last />
        </SettingsGroup>

        <SettingsGroup title="Preferences">
          <AccountRow icon="bell" iconBackground={theme.colors.brandSoft} iconColor={theme.colors.brandPrimary} title="Notifications" subtitle="Trade alerts, results, account activity" onPress={() => router.push('/notifications')} />
          <AccountRow icon="palette" iconBackground={theme.colors.warningSoft} iconColor={theme.colors.warning} title="App Appearance" subtitle="Dark mode, light mode, or system" badge={theme.preference === 'system' ? 'System' : theme.preference === 'dark' ? 'Dark' : 'Light'} badgeTone="neutral" onPress={() => router.push('/account/appearance')} />
          <AccountRow icon="globe" iconBackground={theme.colors.infoSoft} iconColor={theme.colors.info} title="Language & Region" subtitle="English and regional settings" onPress={() => router.push('/account/region')} last />
        </SettingsGroup>

        <SettingsGroup title="Market testing">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
            <IconTile icon="activity" backgroundColor={theme.colors.warningSoft} iconColor={theme.colors.warning} size={density.phone ? 36 : 40} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <VadText variant="bodyStrong" style={{ fontSize: density.phone ? 14 : 15 }}>Test-credit market trading</VadText>
              <VadText variant="caption" tone="secondary" style={{ fontSize: density.phone ? 12 : 13, lineHeight: density.phone ? 16 : 18 }}>
                {marketTestingLoading
                  ? 'Checking your test allocation…'
                  : !marketTestingStatus?.active
                    ? 'No test allocation is assigned to this account.'
                    : marketTestingStatus.testModeEnabled
                      ? 'Enabled. Uses normal NGN markets, orders and settlement.'
                      : 'Allocation available. Trading mode is currently off.'}
              </VadText>
            </View>
            <Switch
              accessibilityLabel="Enable test-credit market trading"
              value={Boolean(marketTestingStatus?.active && marketTestingStatus.testModeEnabled)}
              onValueChange={(enabled) => void handleMarketTestingChange(enabled)}
              disabled={marketTestingLoading || marketTestingSaving || !marketTestingStatus?.active}
              trackColor={{ false: theme.colors.borderStrong, true: theme.colors.brandPrimary }}
              thumbColor={theme.colors.surface}
            />
          </View>
          <View style={{ paddingVertical: 10, gap: 4 }}>
            <VadText variant="caption" tone="secondary">
              This setting is available only when an administrator has assigned a temporary non-cash NGN test allocation. Test trades use the normal NGN market and settlement pipeline, not a separate demo market. Deposits and withdrawals remain blocked while the allocation is active.
            </VadText>
            {marketTestingSaving ? <VadText variant="caption" tone="secondary">Saving preference…</VadText> : null}
            {marketTestingError ? <VadText variant="caption" tone="danger">{marketTestingError}</VadText> : null}
          </View>
        </SettingsGroup>

        <SettingsGroup title="Support">
          <AccountRow icon="lifeBuoy" iconBackground={theme.colors.yesSoft} iconColor={theme.colors.yes} title="Help & Support" subtitle="FAQs, contact and available support options" />
          <AccountRow icon="fileText" iconBackground={theme.colors.brandSoft} iconColor={theme.colors.brandPrimary} title="Terms & Policies" subtitle="Terms of service, privacy policy, risk disclosures" onPress={() => router.push('/account/policies')} />
          <AccountRow icon="info" iconBackground={theme.colors.infoSoft} iconColor={theme.colors.info} title="About VAD Market" subtitle="App version and legal information" onPress={() => router.push('/account/about')} last />
        </SettingsGroup>

        {adminAccessFor === userId && hasAdminAccess ? (
          <SettingsGroup title="Administration">
            <AccountRow icon="operations" iconBackground={theme.colors.brandSoft} iconColor={theme.colors.brandPrimary} title="Admin operations" subtitle="Operations dashboard" onPress={() => router.push('/admin')} last />
          </SettingsGroup>
        ) : null}

        <Pressable accessibilityRole="button" accessibilityLabel="Log out" disabled={signingOut} onPress={requestSignOut} style={({ pressed }) => ({ minHeight: density.phone ? 46 : 48, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.no, backgroundColor: theme.colors.noSoft, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: pressed || signingOut ? 0.65 : 1 })}>
          <VadIcon name="logOut" size={17} tone="no" />
          <VadText variant="bodyStrong" tone="no" style={{ fontSize: density.phone ? 14 : 15 }}>{signingOut ? 'Logging out…' : 'Log Out'}</VadText>
          <VadIcon name="chevronRight" size={16} tone="no" />
        </Pressable>
      </View>
    </ProductRoute>
  );
}

function normalizeCountryCode(code: string | null | undefined, countryName: string) {
  const value = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (/^[A-Z]{2}$/.test(value)) return value;
  const known = countryName.trim().toLowerCase();
  if (known === 'nigeria') return 'NG';
  if (known === 'united states' || known === 'united states of america') return 'US';
  if (known === 'united kingdom' || known === 'uk') return 'GB';
  if (known === 'ghana') return 'GH';
  if (known === 'kenya') return 'KE';
  if (known === 'south africa') return 'ZA';
  return '';
}

function countryNameFromCode(code: string) {
  const names: Record<string, string> = { NG: 'Nigeria', US: 'United States', GB: 'United Kingdom', GH: 'Ghana', KE: 'Kenya', ZA: 'South Africa' };
  return names[code] ?? '';
}

function countryFlag(code: string) {
  return String.fromCodePoint(...[...code].map((character) => 127397 + character.charCodeAt(0)));
}

function getKycCopy(status: KycStatus | null) {
  if (!status) return { title: 'Verification status unavailable', body: 'Open verification details to check the latest status.' };
  switch (status.status) {
    case 'VERIFIED': return { title: 'Account Verified', body: 'Your identity has been verified. Applicable account permissions are confirmed by VAD.' };
    case 'IN_REVIEW':
    case 'PROVIDER_PENDING': return { title: 'Verification In Progress', body: 'Your identity verification is being reviewed. View details for updates.' };
    case 'REJECTED': return { title: 'Verification Needs Attention', body: 'Review the verification details for the next available step.' };
    case 'EXPIRED': return { title: 'Verification Expired', body: 'Your identity verification may need to be renewed.' };
    case 'CANCELLED': return { title: 'Verification Cancelled', body: 'Open verification details to restart if eligible.' };
    case 'CREATED': return { title: 'Verification Started', body: 'Continue your identity verification process.' };
    default: return { title: 'Verify Your Account', body: 'Complete identity verification to check the limits that apply to your account.' };
  }
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const theme = useVadTheme();
  return (
    <View style={{ gap: 6 }}>
      <VadText variant="bodyStrong" style={{ fontSize: 15, lineHeight: 19 }}>{title}</VadText>
      <VadCard style={{ paddingHorizontal: 11, paddingVertical: 1, borderRadius: 15, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, gap: 0 }}>
        {children}
      </VadCard>
    </View>
  );
}

function AccountRow({
  icon,
  iconBackground,
  iconColor,
  title,
  subtitle,
  onPress,
  last = false,
  badge,
  badgeTone = 'neutral',
}: {
  icon: VadIconName;
  iconBackground: string;
  iconColor: string;
  title: string;
  subtitle: string;
  onPress?: () => void;
  last?: boolean;
  badge?: string;
  badgeTone?: 'yes' | 'no' | 'neutral';
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={title} accessibilityHint={subtitle} accessibilityState={{ disabled: !onPress }} disabled={!onPress} onPress={onPress} style={({ pressed }) => ({ minHeight: density.phone ? 58 : 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: density.phone ? 7 : 9, opacity: pressed ? 0.72 : onPress ? 1 : 0.92, borderBottomWidth: last ? 0 : 1, borderBottomColor: theme.colors.border })}>
      <IconTile icon={icon} backgroundColor={iconBackground} iconColor={iconColor} size={density.phone ? 36 : 40} />
      <View style={{ flex: 1, minWidth: 0, gap: 0 }}>
        <VadText variant="bodyStrong" numberOfLines={1} style={{ fontSize: density.phone ? 14 : 15, lineHeight: density.phone ? 18 : 20 }}>{title}</VadText>
        <VadText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: density.phone ? 12 : 13, lineHeight: density.phone ? 16 : 17 }}>{subtitle}</VadText>
      </View>
      {badge ? <StatusBadge label={badge} tone={badgeTone} /> : null}
      {onPress ? <VadIcon name="chevronRight" size={16} tone="tertiary" /> : null}
    </Pressable>
  );
}

function IconTile({ icon, backgroundColor, iconColor, size = 32 }: { icon: VadIconName; backgroundColor: string; iconColor: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: backgroundColor, flexShrink: 0 }}>
      <VadIcon name={icon} size={size * 0.5} color={iconColor} />
    </View>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: 'yes' | 'no' | 'neutral' }) {
  const theme = useVadTheme();
  const color = tone === 'yes' ? theme.colors.yes : tone === 'no' ? theme.colors.no : theme.colors.textSecondary;
  const background = tone === 'yes' ? theme.colors.yesSoft : tone === 'no' ? theme.colors.noSoft : theme.colors.surfaceMuted;
  return <View style={{ borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}><VadText variant="caption" style={{ fontSize: 11, lineHeight: 14, color, fontWeight: '600' }}>{label}</VadText></View>;
}
