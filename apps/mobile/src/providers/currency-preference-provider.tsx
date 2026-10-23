import 'expo-sqlite/localStorage/install';

import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { supabase, supabaseConfiguration } from '@/lib/supabase';
import { verifyCurrentServiceLocation } from '@/services/location-eligibility';

export type VADCurrency = 'NGN' | 'USDC';
type CurrencyPolicy = {
  country_code: string;
  eligible_asset_codes: VADCurrency[];
  enabled_asset_codes: VADCurrency[];
};
type CurrencyPreferenceValue = {
  enabledCurrencies: VADCurrency[];
  eligibleCurrencies: VADCurrency[];
  countryCode: string;
  loading: boolean;
  preferredCurrency: VADCurrency | null;
  setPreferredCurrency: (currency: VADCurrency) => void;
  isCurrencyEligible: (currency: VADCurrency) => boolean;
  isCurrencyEnabled: (currency: VADCurrency) => boolean;
  toggleCurrency: (currency: VADCurrency) => void;
  setEnabledCurrencies: (currencies: VADCurrency[]) => void;
};

const STORAGE_KEY = 'vad:enabled-currencies';
const CurrencyPreferenceContext = createContext<CurrencyPreferenceValue | null>(null);
const SUPPORTED: VADCurrency[] = ['NGN', 'USDC'];

function asCurrencies(value: unknown): VADCurrency[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is VADCurrency => SUPPORTED.includes(item)))];
}

export function CurrencyPreferenceProvider({ children }: PropsWithChildren) {
  const [enabledCurrencies, setEnabledState] = useState<VADCurrency[]>([]);
  const [eligibleCurrencies, setEligibleState] = useState<VADCurrency[]>([]);
  const [countryCode, setCountryCode] = useState('');
  const [preferredCurrency, setPreferredCurrencyState] = useState<VADCurrency | null>(null);
  const [loading, setLoading] = useState(true);
  const countryDetectionAttemptedForUser = useRef<string | null>(null);

  const applyPolicy = useCallback((policy: CurrencyPolicy, savedPreferred: VADCurrency | null) => {
    const country = String(policy.country_code ?? '').trim().toUpperCase();
    const eligible = asCurrencies(policy.eligible_asset_codes);
    const enabled = asCurrencies(policy.enabled_asset_codes).filter((code) => eligible.includes(code));
    // Jurisdiction determines which currencies may be selected. Current-location checks
    // remain enforced by the server when trading or moving NGN funds; they must not
    // silently remove a Nigerian user's currency preference from the UI.
    const safeEligible = country === 'NG' ? eligible : eligible.filter((code) => code !== 'NGN');
    const safeEnabled = country === 'NG' ? enabled : enabled.filter((code) => code !== 'NGN');
    const defaultPreferred = safeEnabled.includes(country === 'NG' ? 'NGN' : 'USDC')
      ? (country === 'NG' ? 'NGN' : 'USDC')
      : safeEnabled[0] ?? null;
    setCountryCode(country);
    setEligibleState(safeEligible);
    setEnabledState(safeEnabled);
    setPreferredCurrencyState(savedPreferred && safeEnabled.includes(savedPreferred) ? savedPreferred : defaultPreferred);
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(safeEnabled));
    } catch {
      // Supabase remains the source of truth when local storage is unavailable.
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!supabaseConfiguration.ready) {
      setLoading(false);
      return;
    }
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        // Do not trust a prior account's cached preference on a signed-out screen.
        setCountryCode('');
        setEligibleState([]);
        setEnabledState([]);
        setPreferredCurrencyState(null);
        countryDetectionAttemptedForUser.current = null;
        return;
      }
      const { data, error } = await supabase.rpc('get_my_currency_policy');
      if (error) throw error;
      let row = (Array.isArray(data) ? data[0] : data) as CurrencyPolicy | null;
      if (!row) throw new Error('Currency policy is unavailable.');

      // If onboarding left the account country blank, make one permissioned attempt
      // to verify the device's real location. The Edge Function only fills an empty
      // country from matching Nigerian GPS + IP evidence; it never overwrites a
      // different, explicitly recorded account jurisdiction.
      if (!String(row.country_code ?? '').trim() && countryDetectionAttemptedForUser.current !== authData.user.id) {
        countryDetectionAttemptedForUser.current = authData.user.id;
        const location = await verifyCurrentServiceLocation().catch(() => ({ allowed: false, reasonCode: 'LOCATION_VERIFICATION_UNAVAILABLE' }));
        if (location.allowed) {
          const { data: refreshedPolicy, error: refreshedPolicyError } = await supabase.rpc('get_my_currency_policy');
          const refreshedRow = (Array.isArray(refreshedPolicy) ? refreshedPolicy[0] : refreshedPolicy) as CurrencyPolicy | null;
          if (!refreshedPolicyError && refreshedRow) row = refreshedRow;
        }
      }

      const { data: preferenceData } = await supabase
        .from('user_currency_preferences')
        .select('preferred_asset_code')
        .eq('user_id', authData.user.id)
        .maybeSingle();
      const savedPreferred = asCurrencies([preferenceData?.preferred_asset_code])[0] ?? null;
      applyPolicy(row, savedPreferred);
    } catch {
      // Preserve the last valid display preference during a transient network issue.
      // Trading and payments independently re-check jurisdiction and live location server-side.
    } finally {
      setLoading(false);
    }
  }, [applyPolicy]);

  useEffect(() => {
    // Start the initial refresh after the effect has returned. This also keeps
    // React's set-state-in-effect lint rule happy while policy state is loaded.
    const initialRefresh = setTimeout(() => {
      void refresh();
    }, 0);
    const refreshInterval = setInterval(() => void refresh(), 60_000);
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      // Defer Supabase reads until after its auth-state callback releases its lock.
      setTimeout(() => void refresh(), 0);
    });
    return () => {
      clearTimeout(initialRefresh);
      clearInterval(refreshInterval);
      listener.subscription.unsubscribe();
    };
  }, [refresh]);

  const persistCurrencies = useCallback(async (currencies: VADCurrency[]) => {
    const next = [...new Set(currencies.filter((currency) => eligibleCurrencies.includes(currency)))];
    if (!next.length) return;
    if (!supabaseConfiguration.ready) {
      Alert.alert('Currency settings unavailable', 'Connect to VAD before changing trading currencies.');
      return;
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        Alert.alert('Sign in required', 'Sign in to change trading currencies.');
        return;
      }

      const nextPreferred = preferredCurrency && next.includes(preferredCurrency)
        ? preferredCurrency
        : next[0] ?? null;
      // This RPC persists both the currency preference and TNGN demo opt-in in
      // one transaction, avoiding a split mode between wallet/markets/portfolio.
      const { data, error } = await supabase.rpc('set_my_currency_preferences', {
        p_enabled_asset_codes: next,
        p_preferred_asset_code: nextPreferred,
      });
      if (error) throw error;

      const response = data as {
        enabled_asset_codes?: unknown;
        preferred_asset_code?: unknown;
      } | null;
      const savedCurrencies = asCurrencies(response?.enabled_asset_codes);
      if (!savedCurrencies.length) {
        throw new Error('The server did not confirm your enabled currency selection.');
      }
      const savedPreferred = asCurrencies([response?.preferred_asset_code])[0]
        ?? savedCurrencies[0];

      setEnabledState(savedCurrencies);
      setPreferredCurrencyState(savedPreferred);
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(savedCurrencies));
      } catch {
        // The database remains the source of truth when local storage is unavailable.
      }
      await refresh();
    } catch (reason) {
      Alert.alert(
        'Could not save currency settings',
        reason instanceof Error
          ? reason.message
          : 'Your currency preference was not saved. Please try again.',
      );
      await refresh();
    }
  }, [eligibleCurrencies, preferredCurrency, refresh]);

  const setEnabledCurrencies = useCallback((currencies: VADCurrency[]) => {
    void persistCurrencies(currencies);
  }, [persistCurrencies]);

  const toggleCurrency = useCallback((currency: VADCurrency) => {
    if (!eligibleCurrencies.includes(currency)) return;
    const next = enabledCurrencies.includes(currency)
      ? enabledCurrencies.filter((item) => item !== currency)
      : [...enabledCurrencies, currency];
    if (!next.length) return;
    void persistCurrencies(next);
  }, [eligibleCurrencies, enabledCurrencies, persistCurrencies]);

  const setPreferredCurrency = useCallback((currency: VADCurrency) => {
    if (!eligibleCurrencies.includes(currency) || !enabledCurrencies.includes(currency)) return;
    void (async () => {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          Alert.alert('Sign in required', 'Sign in to save your preferred display currency.');
          return;
        }
        const { data, error } = await supabase.rpc('set_my_currency_preferences', {
          p_enabled_asset_codes: enabledCurrencies,
          p_preferred_asset_code: currency,
        });
        if (error) throw error;
        const response = data as { preferred_asset_code?: unknown } | null;
        const saved = asCurrencies([response?.preferred_asset_code])[0];
        if (!saved || !enabledCurrencies.includes(saved)) {
          throw new Error('The server did not confirm your preferred display currency.');
        }
        setPreferredCurrencyState(saved);
      } catch (reason) {
        Alert.alert(
          'Could not save currency preference',
          reason instanceof Error ? reason.message : 'Your display currency was not saved. Please try again.',
        );
        await refresh();
      }
    })();
  }, [eligibleCurrencies, enabledCurrencies, refresh]);

  const isCurrencyEligible = useCallback((currency: VADCurrency) => eligibleCurrencies.includes(currency), [eligibleCurrencies]);
  const isCurrencyEnabled = useCallback((currency: VADCurrency) => eligibleCurrencies.includes(currency) && enabledCurrencies.includes(currency), [eligibleCurrencies, enabledCurrencies]);
  const value = useMemo(() => ({
    enabledCurrencies: enabledCurrencies.filter((code) => eligibleCurrencies.includes(code)),
    eligibleCurrencies, countryCode, loading, preferredCurrency, setPreferredCurrency,
    isCurrencyEligible, isCurrencyEnabled, toggleCurrency, setEnabledCurrencies,
  }), [enabledCurrencies, eligibleCurrencies, countryCode, loading, preferredCurrency, setPreferredCurrency, isCurrencyEligible, isCurrencyEnabled, toggleCurrency, setEnabledCurrencies]);

  return <CurrencyPreferenceContext.Provider value={value}>{children}</CurrencyPreferenceContext.Provider>;
}

export function useCurrencyPreference() {
  const value = useContext(CurrencyPreferenceContext);
  if (!value) throw new Error('useCurrencyPreference must be used within CurrencyPreferenceProvider.');
  return value;
}
