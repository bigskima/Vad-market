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
  const [opening, setOpening] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!user) {
      setLoading(false);
      setState(null);
      return () => { active = false; };
    }

    setLoading(true);
    setError(null);
    void getAccountSetupState(user).then((next) => {
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
    if (opening) return;
    setOpening(true);
    router.push({ pathname: '/onboarding', params: { source: 'account' } });
  };

  if (!loading && state && isAccountSetupComplete(state)) return null;

  const completed = state
    ? Number(state.contactConfirmed) + Number(state.profileComplete) + Number(state.kycComplete)
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
            : <VadText variant="heading" tone="brand">{completed}/3</VadText>}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <VadText variant="bodyStrong">Finish setting up VAD</VadText>
          <VadText variant="caption" tone="secondary">
            {error
              ? 'Some account details still need a check. Open setup to retry or choose a reminder.'
              : state
                ? 'Your checklist updates from your real profile, contact confirmation and identity status.'
                : 'Check which essentials are complete and continue where you left off.'}
          </VadText>
        </View>
      </View>
      {error ? <VadText variant="caption" tone="danger">{error}</VadText> : null}
      <VadButton
        label={opening ? 'Opening setup…' : 'Review setup'}
        variant="secondary"
        loading={opening}
        onPress={() => void openSetup()}
      />
    </VadCard>
  );
}
