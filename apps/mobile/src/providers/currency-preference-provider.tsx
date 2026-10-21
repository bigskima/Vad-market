import 'expo-sqlite/localStorage/install';

import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { supabase, supabaseConfiguration } from '@/lib/supabase';
import { verifyCurrentServiceLocation } from '@/services/location-eligibility';

export type VADCurrency = 'NGN' | 'USDC' | 'TNGN';
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
const SUPPORTED: VADCurrency[] = ['NGN', 'USDC', 'TNGN'];

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
  const countryDetectionAttempted = useRef(false);

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
      if (!String(row.country_code ?? '').trim() && !countryDetectionAttempted.current) {
        countryDetectionAttempted.current = true;
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

  const setEnabledCurrencies = useCallback((currencies: VADCurrency[]) => {
    void (async () => {
      const next = [...new Set(currencies.filter((currency) => eligibleCurrencies.includes(currency)))];
      if (!next.length) return;
      if (!supabaseConfiguration.ready) {
        Alert.alert('Currency settings unavailable', 'Connect to VAD before changing trading currencies.');
        return;
      }
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        Alert.alert('Sign in required', 'Sign in to change trading currencies.');
        return;
      }
      if (next.includes('TNGN') !== enabledCurrencies.includes('TNGN')) {
        const { data: tngnEnabled, error: tngnError } = await supabase.rpc('set_my_demo_mode', {
          p_enabled: next.includes('TNGN'),
        });
        if (tngnError || (next.includes('TNGN') && tngnEnabled !== true)) {
          Alert.alert('TNGN unavailable', 'TNGN test trading is disabled by platform settings. Your currency selection was not changed.');
          await refresh();
          return;
        }
      }
      const nextPreferred = preferredCurrency && next.includes(preferredCurrency) ? preferredCurrency : next[0] ?? null;
      const { error: preferenceError } = await supabase.from('user_currency_preferences').upsert({
        user_id: authData.user.id,
        enabled_asset_codes: next,
        preferred_asset_code: nextPreferred,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (preferenceError) {
        Alert.alert('Could not save currency settings', 'Your trading currency preference was not saved. Please try again.');
        await refresh();
        return;
      }
      setEnabledState(next);
      setPreferredCurrencyState(nextPreferred);
      try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next)); catch { /* session fallback */ }
      await refresh();
    })();
  }, [eligibleCurrencies, enabledCurrencies, preferredCurrency, refresh]);

  const toggleCurrency = useCallback((currency: VADCurrency) => {
    if (!eligibleCurrencies.includes(currency)) return;
    const next = enabledCurrencies.includes(currency)
      ? enabledCurrencies.filter((item) => item !== currency)
      : [...enabledCurrencies, currency];
    if (!next.length) return;

    void (async () => {
      if (!supabaseConfiguration.ready) {
        Alert.alert('Currency settings unavailable', 'Connect to VAD before changing trading currencies.');
        return;
      }
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        Alert.alert('Sign in required', 'Sign in to change trading currencies.');
        return;
      }
      if (currency === 'TNGN') {
        const { data: tngnEnabled, error: tngnError } = await supabase.rpc('set_my_demo_mode', {
          p_enabled: next.includes('TNGN'),
        });
        if (tngnError || (next.includes('TNGN') && tngnEnabled !== true)) {
          Alert.alert('TNGN unavailable', 'TNGN test trading is disabled by platform settings. Your currency selection was not changed.');
          await refresh();
          return;
        }
      }
      const nextPreferred = preferredCurrency && next.includes(preferredCurrency) ? preferredCurrency : next[0] ?? null;
      const { error: preferenceError } = await supabase.from('user_currency_preferences').upsert({
        user_id: authData.user.id,
        enabled_asset_codes: next,
        preferred_asset_code: nextPreferred,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (preferenceError) {
        Alert.alert('Could not save currency settings', 'Your trading currency preference was not saved. Please try again.');
        await refresh();
        return;
      }
      setEnabledState(next);
      setPreferredCurrencyState(nextPreferred);
      try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* session fallback */ }
      await refresh();
    })();
  }, [eligibleCurrencies, enabledCurrencies, preferredCurrency, refresh]);

  const setPreferredCurrency = useCallback((currency: VADCurrency) => {
    if (!eligibleCurrencies.includes(currency) || !enabledCurrencies.includes(currency)) return;
    void (async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        Alert.alert('Sign in required', 'Sign in to save your preferred display currency.');
        return;
      }
      const { error } = await supabase.from('user_currency_preferences').upsert({
        user_id: authData.user.id,
        enabled_asset_codes: enabledCurrencies,
        preferred_asset_code: currency,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) {
        Alert.alert('Could not save currency preference', 'Your display currency was not saved. Please try again.');
        return;
      }
      setPreferredCurrencyState(currency);
    })();
  }, [eligibleCurrencies, enabledCurrencies]);

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
