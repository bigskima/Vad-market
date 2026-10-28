import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getAccountSetupState,
  isAccountSetupComplete,
  type AccountSetupState,
} from '@/services/account-onboarding-api';

export function AccountSetupCard() {
  const theme = useVadTheme();
  const { session } = useAuth();
  const user = session?.user;
  const [state, setState] = useState<AccountSetupState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!user) {
      setLoading(false);
      setState(null);
      return () => { active = false; };
    }

    setLoading(true);
    setError(null);
    void getAccountSetupState(user, { includeMilestones: true }).then((next) => {
      if (active) setState(next);
    }).catch((reason) => {
      if (!active) return;
      setState(null);
      setError(reason instanceof Error
        ? reason.message
        : 'Account setup status could not be checked right now.');
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [user]));

  const openSetup = () => {
    router.push({ pathname: '/onboarding', params: { source: 'account' } });
  };

  const allMilestonesComplete = Boolean(
    state
      && isAccountSetupComplete(state)
      && state.firstDepositCheckAvailable
      && state.firstDepositComplete
      && state.firstTradeCheckAvailable
      && state.firstTradeComplete,
  );
  if (!loading && allMilestonesComplete) return null;

  const completed = state
    ? Number(state.contactConfirmed)
      + Number(state.profileComplete)
      + Number(state.kycComplete)
      + Number(state.firstDepositComplete)
      + Number(state.firstTradeComplete)
    : 0;

  return (
    <VadCard style={{ gap: 10, borderColor: theme.colors.brandPrimary }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{
          width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
          backgroundColor: theme.colors.brandSoft,
        }}>
          {loading
            ? <ActivityIndicator size="small" color={theme.colors.brandPrimary} />
            : <VadText variant="heading" tone="brand">{completed}/5</VadText>}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <VadText variant="bodyStrong">Your VAD journey</VadText>
          <VadText variant="caption" tone="secondary">
            {error
              ? 'See which account setup and first-use milestones remain, then continue where you left off.'
              : state
                ? 'Your progress follows your real account, completed deposits and recorded trades.'
                : 'Review your account essentials, first deposit and first trade in one place.'}
          </VadText>
        </View>
      </View>
      {error ? <VadText variant="caption" tone="danger">{error}</VadText> : null}
      <VadButton
        label="Continue onboarding"
        variant="secondary"
        onPress={openSetup}
      />
    </VadCard>
  );
}
