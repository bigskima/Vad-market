import 'expo-sqlite/localStorage/install';

import { createContext, type PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';

export type VADCurrency = 'NGN' | 'USDC';
type CurrencyPreferenceValue = {
  enabledCurrencies: VADCurrency[];
  isCurrencyEnabled: (currency: VADCurrency) => boolean;
  toggleCurrency: (currency: VADCurrency) => void;
  setEnabledCurrencies: (currencies: VADCurrency[]) => void;
};

const STORAGE_KEY = 'vad:enabled-currencies';
const CurrencyPreferenceContext = createContext<CurrencyPreferenceValue | null>(null);

function readInitialCurrencies(): VADCurrency[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return ['NGN', 'USDC'];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return ['NGN', 'USDC'];
    const valid = parsed.filter((item): item is VADCurrency => item === 'NGN' || item === 'USDC');
    return valid.length ? [...new Set(valid)] : ['NGN', 'USDC'];
  } catch {
    return ['NGN', 'USDC'];
  }
}

export function CurrencyPreferenceProvider({ children }: PropsWithChildren) {
  const [enabledCurrencies, setEnabledState] = useState<VADCurrency[]>(readInitialCurrencies);

  const setEnabledCurrencies = useCallback((currencies: VADCurrency[]) => {
    const next = [...new Set(currencies.filter((currency): currency is VADCurrency => currency === 'NGN' || currency === 'USDC'))];
    if (!next.length) return;
    setEnabledState(next);
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Keep the preference for the current session when storage is unavailable.
    }
  }, []);

  const toggleCurrency = useCallback((currency: VADCurrency) => {
    setEnabledState((current) => {
      const next = current.includes(currency)
        ? current.filter((item) => item !== currency)
        : [...current, currency];
      if (!next.length) return current;
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Keep the preference for the current session when storage is unavailable.
      }
      return next;
    });
  }, []);

  const isCurrencyEnabled = useCallback((currency: VADCurrency) => enabledCurrencies.includes(currency), [enabledCurrencies]);
  const value = useMemo(() => ({ enabledCurrencies, isCurrencyEnabled, toggleCurrency, setEnabledCurrencies }), [enabledCurrencies, isCurrencyEnabled, toggleCurrency, setEnabledCurrencies]);

  return <CurrencyPreferenceContext.Provider value={value}>{children}</CurrencyPreferenceContext.Provider>;
}

export function useCurrencyPreference() {
  const value = useContext(CurrencyPreferenceContext);
  if (!value) throw new Error('useCurrencyPreference must be used within CurrencyPreferenceProvider.');
  return value;
}
