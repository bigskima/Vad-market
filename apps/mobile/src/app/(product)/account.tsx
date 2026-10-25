import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Image, Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
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
import { getTemporaryNgnMarketTestingStatus, setTemporaryNgnMarketTesting, type TemporaryNgnMarketTestingStatus } from '@/services/temporary-ngn-market-testing-api';
import { supabase } from '@/lib/supabase';
import { locationVerificationMessage, verifyCurrentServiceLocation } from '@/services/location-eligibility';

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
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [testModeStatus, setTestModeStatus] = useState<TemporaryNgnMarketTestingStatus | null>(null);
  const [testModeSaving, setTestModeSaving] = useState(false);
  const [testModeLocationSaving, setTestModeLocationSaving] = useState(false);
  const [testModeError, setTestModeError] = useState<string | null>(null);
  const [testModeNotice, setTestModeNotice] = useState<string | null>(null);

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

  useFocusEffect(useCallback(() => {
    if (!userId) return undefined;
    let ignore = false;
    void getTemporaryNgnMarketTestingStatus()
      .then((status) => {
        if (!ignore) {
          setTestModeStatus(status);
          setTestModeError(null);
          setTestModeNotice(null);
        }
      })
      .catch((reason) => {
        if (!ignore) {
          setTestModeStatus(null);
          setTestModeError(reason instanceof Error ? reason.message : 'Temporary NGN market-testing status could not be loaded.');
        }
      });
    return () => { ignore = true; };
  }, [userId]));



  const isVerified = kycStatus?.status === 'VERIFIED';
  const kycCopy = getKycCopy(kycStatus);
  const requestSignOut = () => {
    setSignOutError(null);
    setConfirmSignOut(true);
  };

  const confirmAndSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    try {
      await signOut();
      setConfirmSignOut(false);
      router.replace('/');
    } catch {
      setSignOutError('Could not log out. Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  const verifyMarketTestingLocation = async () => {
    if (testModeLocationSaving) return;
    setTestModeLocationSaving(true);
    setTestModeError(null);
    setTestModeNotice(null);
    try {
      const result = await verifyCurrentServiceLocation();
      if (!result.allowed) {
        throw new Error(locationVerificationMessage(result.reasonCode));
      }

      // GPS verification succeeded. Market-testing eligibility is a separate
      // check and must not overwrite a successful location result with a false
      // "location unavailable" message.
      let refreshed: TemporaryNgnMarketTestingStatus | null;
      try {
        refreshed = await getTemporaryNgnMarketTestingStatus();
      } catch {
        setTestModeNotice('Location verified. Market-testing status could not refresh; try again.');
        return;
      }
      setTestModeStatus(refreshed);
      if (!refreshed?.active) {
        setTestModeNotice('Location verified. No active NGN test credit is assigned to this account yet.');
        return;
      }
      if (!refreshed.eligible) {
        setTestModeNotice('Location verified. ' + testModeBlockReason(refreshed));
        return;
      }
      setTestModeNotice('Location verified. You can now enable NGN market testing.');
    } catch (reason) {
      setTestModeError(reason instanceof Error ? reason.message : 'Current Nigeria location could not be verified.');
      try {
        const refreshed = await getTemporaryNgnMarketTestingStatus();
        setTestModeStatus(refreshed);
      } catch {
        // Keep the last confirmed status.
      }
    } finally {
      setTestModeLocationSaving(false);
    }
  };

  const toggleTemporaryNgnMarketTesting = async () => {
    if (!testModeStatus?.active || testModeSaving) return;
    const next = !testModeStatus.testModeEnabled;
    if (next && !testModeStatus.eligible) {
      setTestModeError(testModeBlockReason(testModeStatus));
      return;
    }
    setTestModeSaving(true);
    setTestModeError(null);
    setTestModeNotice(null);
    try {
      const status = await setTemporaryNgnMarketTesting(next);
      setTestModeStatus(status);
      await refreshPortfolio();
    } catch (reason) {
      setTestModeError(reason instanceof Error ? reason.message : 'The NGN market-testing preference could not be saved.');
      try {
        const latest = await getTemporaryNgnMarketTestingStatus();
        setTestModeStatus(latest);
      } catch {
        // Keep the last confirmed state visible if refresh fails.
      }
    } finally {
      setTestModeSaving(false);
    }
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

        {testModeStatus?.active ? (
          <VadCard style={{ gap: density.phone ? 10 : 14, padding: density.phone ? 12 : 16, borderRadius: 17, borderColor: testModeStatus.testModeEnabled ? theme.colors.brandPrimary : theme.colors.border, backgroundColor: theme.colors.surface }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <VadText variant="bodyStrong">Temporary NGN market testing</VadText>
                <VadText variant="caption" tone="secondary">Use test credit to trade open NGN markets.</VadText>
              </View>
              <StatusBadge
                label={testModeStatus.testModeEnabled ? 'Enabled' : 'Off'}
                tone={testModeStatus.testModeEnabled ? 'yes' : 'neutral'}
              />
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, padding: 12, borderRadius: 12, backgroundColor: theme.colors.surfaceRaised }}>
              <View style={{ flex: 1, gap: 3 }}>
                <VadText variant="caption" tone="secondary">Allocated test credit</VadText>
                <VadText variant="title">{formatTestNgn(testModeStatus.grantAmount)}</VadText>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end', gap: 3 }}>
                <VadText variant="caption" tone="secondary">Current NGN balance</VadText>
                <VadText variant="title">{formatTestNgn(testModeStatus.availableBalance)}</VadText>
              </View>
            </View>

            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Use temporary NGN test credit for market trading"
              accessibilityHint="Use or pause your NGN test credit."
              accessibilityState={{ checked: testModeStatus.testModeEnabled, disabled: testModeSaving || (!testModeStatus.eligible && !testModeStatus.testModeEnabled) }}
              disabled={testModeSaving || (!testModeStatus.eligible && !testModeStatus.testModeEnabled)}
              onPress={() => void toggleTemporaryNgnMarketTesting()}
              style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, opacity: testModeSaving ? 0.55 : pressed ? 0.75 : 1 })}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <VadText variant="bodyStrong">{testModeSaving ? 'Saving market-testing setting…' : 'Use allocation for NGN trading'}</VadText>
                <VadText variant="caption" tone="secondary">{testModeStatus.testModeEnabled ? 'Use test credit for new predictions.' : 'Turn on to use test credit.'}</VadText>
              </View>
              <View style={{ width: 48, height: 28, borderRadius: 18, padding: 3, justifyContent: 'center', backgroundColor: testModeStatus.testModeEnabled ? theme.colors.brandPrimary : theme.colors.surfaceMuted, borderWidth: 1, borderColor: testModeStatus.testModeEnabled ? theme.colors.brandPrimary : theme.colors.border }}>
                <View style={{ width: 20, height: 20, borderRadius: 12, alignSelf: testModeStatus.testModeEnabled ? 'flex-end' : 'flex-start', backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border }} />
              </View>
            </Pressable>

            {!testModeStatus.eligible ? (
              <View style={{ borderRadius: 12, borderWidth: 1, borderColor: theme.colors.warning, padding: 11, gap: 4 }}>
                <VadText variant="bodyStrong">More checks required</VadText>
                <VadText variant="caption" tone="secondary">{testModeBlockReason(testModeStatus)}</VadText>
                {[
                  'LOCATION_CHECK_REQUIRED',
                  'LOCATION_CHECK_EXPIRED',
                  'LOCATION_MISMATCH',
                  'NETWORK_RISK',
                  'LOCATION_PROVIDER_ERROR',
                  'LOCATION_CHECK_FAILED',
                  'NETWORK_RISK_UNRESOLVED',
                  'LOCATION_VERIFICATION_UNAVAILABLE',
                  'CLIENT_IP_UNAVAILABLE',
                  'COUNTRY_UNRESOLVED',
                  'LOCATION_SAVE_FAILED',
                ].includes(testModeStatus.reasonCode ?? '') ? (
                  <View style={{ alignSelf: 'flex-start', paddingTop: 5 }}>
                    <VadButton
                      label={testModeLocationSaving ? 'Verifying location…' : 'Verify current location'}
                      variant="secondary"
                      size="small"
                      fullWidth={false}
                      loading={testModeLocationSaving}
                      disabled={testModeLocationSaving}
                      onPress={() => void verifyMarketTestingLocation()}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            {testModeStatus.openMarketCount === 0 ? (
              <VadText variant="caption" tone="warning">No open NGN markets right now.</VadText>
            ) : null}

            <VadText variant="caption" tone="secondary">
              This is non-cash credit for NGN market trading. Deposits and withdrawals stay disabled while it is active. Test credit cannot mix with cash-funded NGN.
            </VadText>
            {testModeNotice ? <VadText variant="caption" tone="secondary">{testModeNotice}</VadText> : null}
            {testModeError ? <VadText variant="caption" tone="danger">{testModeError}</VadText> : null}
          </VadCard>
        ) : null}
        {testModeNotice && !testModeStatus?.active ? <VadText variant="caption" tone="secondary">{testModeNotice}</VadText> : null}
        {testModeError && !testModeStatus?.active ? <VadText variant="caption" tone="danger">{testModeError}</VadText> : null}

        <SettingsGroup title="Account">
          <AccountRow icon="account" iconBackground={theme.colors.infoSoft} iconColor={theme.colors.info} title="Personal Information" subtitle="Name, email, phone number, country" onPress={() => router.push('/account/profile')} />
          <AccountRow icon="creditCard" iconBackground={theme.colors.brandSoft} iconColor={theme.colors.brandPrimary} title="Verification (KYC)" subtitle="Identity verification and documents" badge={isVerified ? 'Verified' : undefined} badgeTone="yes" onPress={() => router.push('/account/verification')} />
          <AccountRow icon="bookmark" iconBackground={theme.colors.infoSoft} iconColor={theme.colors.info} title="Watchlist" subtitle="Saved markets and price moves" onPress={() => router.push('/watchlist')} />
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
        {confirmSignOut ? (
          <VadCard style={{ gap: 10, borderColor: theme.colors.no }}>
            <VadText variant="bodyStrong">Log out of VAD Market?</VadText>
            <VadText variant="caption" tone="secondary">You will need to sign in again to access your account.</VadText>
            {signOutError ? <VadText variant="caption" tone="no">{signOutError}</VadText> : null}
            <View style={{ flexDirection: density.phone ? 'column' : 'row', gap: 8, justifyContent: 'flex-end' }}>
              <VadButton
                label="Cancel"
                variant="secondary"
                onPress={() => { setConfirmSignOut(false); setSignOutError(null); }}
                disabled={signingOut}
              />
              <VadButton
                label={signingOut ? 'Logging out…' : 'Log out'}
                onPress={() => void confirmAndSignOut()}
                loading={signingOut}
                disabled={signingOut}
              />
            </View>
          </VadCard>
        ) : null}
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

function formatTestNgn(value: number | string | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '—';
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function testModeBlockReason(status: TemporaryNgnMarketTestingStatus) {
  switch (status.reasonCode) {
    case 'LOCATION_CHECK_REQUIRED':
      return 'Verify your location in Nigeria to enable test credit.';
    case 'LOCATION_CHECK_EXPIRED':
      return 'Your Nigeria location check expired. Verify again to enable test credit.';
    case 'LOCATION_MISMATCH':
      return 'Your country and current location must match Nigeria.';
    case 'NETWORK_RISK':
      return 'Turn off VPN or proxy, then verify your location again.';
    case 'LOCATION_PROVIDER_ERROR':
    case 'LOCATION_CHECK_FAILED':
    case 'NETWORK_RISK_UNRESOLVED':
    case 'LOCATION_VERIFICATION_UNAVAILABLE':
    case 'CLIENT_IP_UNAVAILABLE':
    case 'COUNTRY_UNRESOLVED':
    case 'LOCATION_SAVE_FAILED':
      return locationVerificationMessage(status.reasonCode);
    case 'ACCOUNT_NOT_ACTIVE':
      return 'Your VAD account must be active before market testing can be enabled.';
    case 'ACCOUNT_NOT_ELIGIBLE':
      return 'Available to eligible Nigerian accounts only.';
    case 'NGN_ASSET_UNAVAILABLE':
      return 'The NGN wallet is unavailable.';
    case 'TRADING_SERVICE_UNAVAILABLE':
      return 'The trading service is currently unavailable for this account.';
    case 'NGN_NOT_AVAILABLE_IN_JURISDICTION':
      return 'NGN is not enabled for this account under the current jurisdiction rules.';
    default:
      return status.message || 'This account does not currently satisfy the requirements for NGN market testing.';
  }
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
