import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useAuth } from '@/providers/auth-provider';
import { useCurrencyPreference, type VADCurrency } from '@/providers/currency-preference-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import {
  deferAccountOnboarding,
  getAccountSetupState,
  isAccountSetupComplete,
  markAccountOnboardingCompleted,
  type AccountSetupState,
} from '@/services/account-onboarding-api';
import { supabase } from '@/lib/supabase';

type SetupTask = {
  key: string;
  title: string;
  description: string;
  complete: boolean;
  action: string;
  route?: '/account/profile' | '/account/verification';
  contact?: boolean;
};

export default function AccountOnboardingScreen() {
  const theme = useVadTheme();
  const { session } = useAuth();
  const productData = useProductDataContext();
  const currency = useCurrencyPreference();
  const params = useLocalSearchParams<{ source?: string | string[] }>();
  const sourceValue = Array.isArray(params.source) ? params.source[0] : params.source;
  const returnToAccount = sourceValue === 'account';
  const user = session?.user;
  const [state, setState] = useState<AccountSetupState | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setState(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await getAccountSetupState(user);
      setState(next);
      if (isAccountSetupComplete(next)) {
        try {
          await markAccountOnboardingCompleted();
        } catch {
          // Setup is complete; a temporary metadata write failure should not
          // prevent the member from entering VAD.
        }
      }
    } catch (reason) {
      setError(reason instanceof Error
        ? reason.message
        : 'We could not check your setup right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.email_confirmed_at, user?.phone_confirmed_at]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      if (!user) {
        if (active) {
          setState(null);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const next = await getAccountSetupState(user);
        if (!active) return;
        setState(next);
        if (isAccountSetupComplete(next)) {
          try {
            await markAccountOnboardingCompleted();
          } catch {
            // Completing setup remains possible even if metadata storage is
            // briefly unavailable.
          }
        }
      } catch (reason) {
        if (!active) return;
        setError(reason instanceof Error
          ? reason.message
          : 'We could not check your setup right now. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user?.id, user?.email_confirmed_at, user?.phone_confirmed_at]));

  const requiredTasks = useMemo<SetupTask[]>(() => {
    if (!state || !user) return [];
    const contactName = user.email ? 'email address' : 'phone number';
    const kycStatus = state.kycStatus?.status;
    const kycVerified = kycStatus === 'VERIFIED';
    const kycInReview = kycStatus === 'IN_REVIEW' || kycStatus === 'PROVIDER_PENDING';

    return [
      {
        key: 'contact',
        title: state.contactConfirmed ? 'Contact details confirmed' : 'Confirm your ' + contactName,
        description: state.contactConfirmed
          ? 'VAD has a confirmed way to reach you about account activity.'
          : 'Confirm your email address or phone number to finish securing your account.',
        complete: state.contactConfirmed,
        action: state.contactConfirmed ? 'Complete' : 'Send confirmation',
        contact: !state.contactConfirmed,
      },
      {
        key: 'profile',
        title: state.profileComplete ? 'Personal profile completed' : 'Complete your profile',
        description: state.profileComplete
          ? 'Your public display name and username are set.'
          : 'Choose a display name and username so your VAD account is ready to use.',
        complete: state.profileComplete,
        action: state.profileComplete ? 'Complete' : 'Complete profile',
        route: '/account/profile',
      },
      {
        key: 'identity',
        title: kycVerified ? 'Identity verified' : kycInReview ? 'Identity check submitted' : 'Verify your identity',
        description: kycVerified
          ? 'Your identity verification is complete.'
          : kycInReview
            ? 'Your verification has been submitted. VAD will update its status when the review changes.'
            : state.kycStatus?.kycStartAvailable === false
              ? 'Identity verification is temporarily unavailable. You can try again later.'
              : 'Start and finish the available identity check. If a review is already in progress, this step will update automatically.',
        complete: state.kycComplete,
        action: state.kycComplete ? 'Complete' : 'Open verification',
        route: '/account/verification',
      },
    ];
  }, [state, user]);

  const completedRequired = requiredTasks.filter((task) => task.complete).length;
  const requiredCount = requiredTasks.length;
  const progressPercent = requiredCount ? Math.round((completedRequired / requiredCount) * 100) : 0;
  const allRequiredComplete = Boolean(state && isAccountSetupComplete(state));
  const eligibleCurrencies = (['NGN', 'USDC'] as VADCurrency[])
    .filter((code) => currency.isCurrencyEligible(code));
  const enabledCurrencies = eligibleCurrencies.filter((code) => currency.isCurrencyEnabled(code));

  async function resendConfirmation() {
    if (!user || working) return;
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      const result = user.email
        ? await supabase.auth.resend({ type: 'signup', email: user.email })
        : user.phone
          ? await supabase.auth.resend({ type: 'sms', phone: user.phone })
          : { error: new Error('There is no email address or phone number to confirm on this account.') };
      if (result.error) throw result.error;
      setNotice('Confirmation instructions have been sent. Follow them, then return here and check your progress.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not send confirmation instructions. Please try again.');
    } finally {
      setWorking(false);
    }
  }

  async function remindLater() {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      await deferAccountOnboarding(7);
      router.replace(returnToAccount ? '/account' : '/home');
    } catch (reason) {
      setError(reason instanceof Error
        ? 'We could not save your reminder. Please try again so VAD can remind you in 7 days.'
        : 'We could not save your reminder. Please try again.');
    } finally {
      setWorking(false);
    }
  }

  async function continueToVAD() {
    setWorking(true);
    setError(null);
    try {
      await markAccountOnboardingCompleted();
      router.replace(returnToAccount ? '/account' : '/home');
    } catch {
      // The required steps are complete, so navigation should still work.
      router.replace(returnToAccount ? '/account' : '/home');
    } finally {
      setWorking(false);
    }
  }

  function openTask(task: SetupTask) {
    if (task.contact) {
      void resendConfirmation();
      return;
    }
    if (task.route) router.push(task.route);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top', 'bottom']}>
      <View style={{ flex: 1, width: '100%', maxWidth: 800, alignSelf: 'center' }}>
        <View style={{
          minHeight: 58,
          paddingHorizontal: 18,
          paddingVertical: 9,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <VadLogo size={31} />
            <View style={{ gap: 0 }}>
              <VadText variant="bodyStrong">VAD</VadText>
              <VadText variant="caption" tone="secondary">Account setup</VadText>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => void remindLater()}
            disabled={working}
            style={({ pressed }) => ({ paddingHorizontal: 8, paddingVertical: 10, opacity: pressed || working ? 0.55 : 1 })}
          >
            <VadText variant="caption" tone="secondary">Remind me in 7 days</VadText>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: 32, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: 8, paddingTop: 4 }}>
            <VadText variant="caption" tone="brand">YOUR VAD STARTING POINT</VadText>
            <VadText variant="title" style={{ fontSize: 27, lineHeight: 33 }}>
              {allRequiredComplete ? "You're all set." : 'Let’s get your account ready.'}
            </VadText>
            <VadText variant="body" tone="secondary">
              {allRequiredComplete
                ? 'Your essential setup is complete. You can now explore VAD and return to any optional settings whenever you need them.'
                : 'VAD checks what is already complete and only asks you to finish what is still missing. Your progress is saved to your account.'}
            </VadText>
          </View>

          {!loading && state && !allRequiredComplete ? (
            <VadCard style={{ gap: 10, padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <VadText variant="bodyStrong">Essential setup</VadText>
                <VadText variant="caption" tone="secondary">{completedRequired} of {requiredCount} complete</VadText>
              </View>
              <View style={{ height: 7, borderRadius: 5, overflow: 'hidden', backgroundColor: theme.colors.surfaceMuted }}>
                <View style={{ width: (String(progressPercent) + '%') as never, height: '100%', borderRadius: 5, backgroundColor: theme.colors.brandPrimary }} />
              </View>
            </VadCard>
          ) : null}

          {loading ? (
            <VadCard style={{ alignItems: 'center', paddingVertical: 28, gap: 12 }}>
              <ActivityIndicator color={theme.colors.brandPrimary} />
              <VadText variant="body" tone="secondary">Checking your profile, verification and contact status…</VadText>
            </VadCard>
          ) : null}

          {!loading && state ? (
            <View style={{ gap: 10 }}>
              <VadText variant="heading">Essential steps</VadText>
              {requiredTasks.map((task, index) => (
                <SetupTaskCard
                  key={task.key}
                  task={task}
                  index={index + 1}
                  onPress={() => openTask(task)}
                  disabled={working}
                />
              ))}
            </View>
          ) : null}

          {!loading && allRequiredComplete ? (
            <VadCard style={{ gap: 12, borderColor: theme.colors.yes, backgroundColor: theme.colors.yesSoft }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <VadIcon name="shieldCheck" size={27} color={theme.colors.yes} />
                <VadText variant="heading">Essential setup complete</VadText>
              </View>
              <VadText variant="body" tone="secondary">
                You can use VAD now. The suggestions below are optional and will not stop you from exploring markets.
              </VadText>
            </VadCard>
          ) : null}

          {!loading && state ? (
            <View style={{ gap: 10 }}>
              <VadText variant="heading">Recommended next steps</VadText>
              {eligibleCurrencies.length > 0 ? (
                <OptionalTaskCard
                  icon="globe"
                  title="Choose your currency view"
                  description={enabledCurrencies.length > 0
                    ? 'You already have an eligible currency enabled. Review your preferences whenever you like.'
                    : 'Choose which eligible currency to show in Markets, Wallet and Portfolio.'}
                  detail={enabledCurrencies.length > 0 ? enabledCurrencies.join(', ') : undefined}
                  onPress={() => router.push('/account/region')}
                />
              ) : null}
              {state.mfaEnabled !== true ? (
                <OptionalTaskCard
                  icon="lock"
                  title="Add another layer of security"
                  description="Set up two-factor authentication in Security Settings. This is recommended, not required to continue."
                  onPress={() => router.push('/account/security')}
                />
              ) : (
                <OptionalTaskCard
                  icon="shieldCheck"
                  title="Two-factor authentication is enabled"
                  description="Your account has an additional sign-in security step."
                  complete
                  onPress={() => router.push('/account/security')}
                />
              )}
              <OptionalTaskCard
                icon="wallet"
                title="Explore your wallet"
                description="Review your available balances and wallet options when you are ready."
                onPress={() => router.push('/wallet')}
              />
            </View>
          ) : null}

          {error ? (
            <VadCard style={{ gap: 10, borderColor: theme.colors.danger }}>
              <VadText variant="bodyStrong" tone="danger">Setup needs another check</VadText>
              <VadText variant="caption" tone="secondary">{error}</VadText>
              <VadButton label="Try again" variant="secondary" onPress={() => void refresh()} disabled={loading || working} />
            </VadCard>
          ) : null}
          {notice ? (
            <VadCard style={{ gap: 8, borderColor: theme.colors.info }}>
              <VadText variant="bodyStrong">Check your messages</VadText>
              <VadText variant="caption" tone="secondary">{notice}</VadText>
              <VadButton label="Check progress again" variant="secondary" onPress={() => void refresh()} />
            </VadCard>
          ) : null}

          {!loading && !state && !error ? (
            <VadCard style={{ gap: 8 }}>
              <VadText variant="bodyStrong">We could not read your account status</VadText>
              <VadText variant="caption" tone="secondary">Retry the check. You can also choose to be reminded in 7 days.</VadText>
              <VadButton label="Try again" onPress={() => void refresh()} />
            </VadCard>
          ) : null}

          <View style={{ gap: 9, paddingTop: 4 }}>
            {allRequiredComplete ? (
              <VadButton label="Continue to VAD" size="large" loading={working} onPress={() => void continueToVAD()} />
            ) : (
              <VadButton
                label={working ? 'Saving…' : 'Remind me in 7 days'}
                variant="secondary"
                size="large"
                loading={working}
                disabled={loading}
                onPress={() => void remindLater()}
              />
            )}
            <VadText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
              Verification may depend on the service available to your account. Optional security and currency preferences never block access to VAD.
            </VadText>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function SetupTaskCard({
  task,
  index,
  onPress,
  disabled,
}: {
  task: SetupTask;
  index: number;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useVadTheme();
  const accent = task.complete ? theme.colors.yes : theme.colors.brandPrimary;
  return (
    <VadCard style={{ padding: 13, gap: 10, borderColor: task.complete ? theme.colors.yes : theme.colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{
          width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
          backgroundColor: task.complete ? theme.colors.yesSoft : theme.colors.brandSoft,
        }}>
          {task.complete
            ? <VadIcon name="shieldCheck" size={19} color={theme.colors.yes} />
            : <VadText variant="label" tone="brand">{index}</VadText>}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <VadText variant="bodyStrong">{task.title}</VadText>
          <VadText variant="caption" tone="secondary">{task.description}</VadText>
        </View>
      </View>
      {!task.complete ? (
        <VadButton
          label={task.action}
          variant="secondary"
          size="small"
          onPress={onPress}
          disabled={disabled}
        />
      ) : (
        <VadText variant="caption" tone="yes">Complete</VadText>
      )}
    </VadCard>
  );
}

function OptionalTaskCard({
  icon,
  title,
  description,
  detail,
  complete = false,
  onPress,
}: {
  icon: 'globe' | 'lock' | 'shieldCheck' | 'wallet';
  title: string;
  description: string;
  detail?: string;
  complete?: boolean;
  onPress: () => void;
}) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        padding: 13,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{
        width: 38, height: 38, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
        backgroundColor: complete ? theme.colors.yesSoft : theme.colors.surfaceMuted,
      }}>
        <VadIcon name={icon} size={20} color={complete ? theme.colors.yes : theme.colors.textSecondary} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <VadText variant="bodyStrong">{title}</VadText>
        <VadText variant="caption" tone="secondary">{description}</VadText>
        {detail ? <VadText variant="caption" tone="brand">{detail}</VadText> : null}
      </View>
      <VadIcon name="chevronRight" size={18} tone="secondary" />
    </Pressable>
  );
}
