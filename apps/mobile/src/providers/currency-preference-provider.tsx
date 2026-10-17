import 'expo-sqlite/localStorage/install';

import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
  const [loading, setLoading] = useState(true);

  const applyPolicy = useCallback((policy: CurrencyPolicy, ngnLocationAllowed: boolean) => {
    const eligible = asCurrencies(policy.eligible_asset_codes);
    const enabled = asCurrencies(policy.enabled_asset_codes).filter((code) => eligible.includes(code));
    // Non-Nigerian jurisdictions must never render NGN, even if a stale preference exists.
    const safeEligible = policy.country_code === 'NG' ? eligible : eligible.filter((code) => code !== 'NGN');
    const safeEnabled = policy.country_code === 'NG' ? enabled : enabled.filter((code) => code !== 'NGN');
    const locationCheckedEnabled = ngnLocationAllowed ? safeEnabled : safeEnabled.filter((code) => code !== 'NGN');
    setCountryCode(policy.country_code);
    setEligibleState(safeEligible);
    setEnabledState(locationCheckedEnabled);
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(locationCheckedEnabled));
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
        return;
      }
      const { data, error } = await supabase.rpc('get_my_currency_policy');
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as CurrencyPolicy | null;
      if (!row) throw new Error('Currency policy is unavailable.');
      let ngnLocationAllowed = false;
      if (row.country_code === 'NG') {
        const { data: accessData, error: accessError } = await supabase.rpc('can_access_ngn_services');
        const accessRow = (Array.isArray(accessData) ? accessData[0] : accessData) as { allowed?: boolean } | null;
        ngnLocationAllowed = !accessError && accessRow?.allowed === true;
      }
      applyPolicy(row, ngnLocationAllowed);
    } catch {
      // A stale verification must never keep NGN visible after a policy/network failure.
      setEnabledState((current) => current.filter((code) => code !== 'NGN'));
      try {
        const cached = globalThis.localStorage?.getItem(STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as unknown;
          globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(asCurrencies(parsed).filter((code) => code !== 'NGN')));
        }
      } catch { /* storage is only a display cache */ }
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
      let next = [...new Set(currencies.filter((currency) => eligibleCurrencies.includes(currency)))];
      if (next.includes('NGN')) {
        const location = await verifyCurrentServiceLocation().catch(() => ({ allowed: false, reasonCode: 'LOCATION_VERIFICATION_UNAVAILABLE' }));
        if (!location.allowed) {
          next = next.filter((currency) => currency !== 'NGN');
          Alert.alert('NGN access unavailable', location.reasonCode === 'LOCATION_PERMISSION_REQUIRED'
            ? 'Allow location access to verify that you are currently in Nigeria.'
            : 'VAD could not verify your current location and network. NGN services remain restricted.');
        }
      }
      if (!next.length) return;
      setEnabledState(next);
      try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* session fallback */ }
      if (!supabaseConfiguration.ready) return;
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      await supabase.from('user_currency_preferences').upsert({
        user_id: data.user.id,
        enabled_asset_codes: next,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      await refresh();
    })();
  }, [eligibleCurrencies, refresh]);

  const toggleCurrency = useCallback((currency: VADCurrency) => {
    if (!eligibleCurrencies.includes(currency)) return;
    const next = enabledCurrencies.includes(currency)
      ? enabledCurrencies.filter((item) => item !== currency)
      : [...enabledCurrencies, currency];
    if (!next.length) return;

    void (async () => {
      if (currency === 'NGN' && !enabledCurrencies.includes('NGN')) {
        const location = await verifyCurrentServiceLocation().catch(() => ({ allowed: false, reasonCode: 'LOCATION_VERIFICATION_UNAVAILABLE' }));
        if (!location.allowed) {
          Alert.alert('NGN access unavailable', location.reasonCode === 'LOCATION_PERMISSION_REQUIRED'
            ? 'Allow location access to verify that you are currently in Nigeria.'
            : 'VAD could not verify your current location and network. NGN services remain restricted.');
          return;
        }
      }
      setEnabledState(next);
      try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* session fallback */ }
      if (!supabaseConfiguration.ready) return;
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      await supabase.from('user_currency_preferences').upsert({
        user_id: data.user.id,
        enabled_asset_codes: next,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      await refresh();
    })();
  }, [eligibleCurrencies, enabledCurrencies, refresh]);

  const isCurrencyEligible = useCallback((currency: VADCurrency) => eligibleCurrencies.includes(currency), [eligibleCurrencies]);
  const isCurrencyEnabled = useCallback((currency: VADCurrency) => eligibleCurrencies.includes(currency) && enabledCurrencies.includes(currency), [eligibleCurrencies, enabledCurrencies]);
  const value = useMemo(() => ({
    enabledCurrencies: enabledCurrencies.filter((code) => eligibleCurrencies.includes(code)),
    eligibleCurrencies, countryCode, loading, isCurrencyEligible, isCurrencyEnabled, toggleCurrency, setEnabledCurrencies,
  }), [enabledCurrencies, eligibleCurrencies, countryCode, loading, isCurrencyEligible, isCurrencyEnabled, toggleCurrency, setEnabledCurrencies]);

  return <CurrencyPreferenceContext.Provider value={value}>{children}</CurrencyPreferenceContext.Provider>;
}

export function useCurrencyPreference() {
  const value = useContext(CurrencyPreferenceContext);
  if (!value) throw new Error('useCurrencyPreference must be used within CurrencyPreferenceProvider.');
  return value;
}
