import 'expo-sqlite/localStorage/install';

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import { makeVadTheme, type VadTheme } from '@/theme/themes';
import type { VadThemeMode, VadThemePreference } from '@/theme/tokens';

const THEME_PREFERENCE_KEY = 'vad:theme-preference';

type VadThemeContextValue = VadTheme & {
  preference: VadThemePreference;
  systemMode: VadThemeMode;
  setPreference(preference: VadThemePreference): void;
};

const VadThemeContext = createContext<VadThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is VadThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function VadThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const systemMode: VadThemeMode = systemScheme === 'dark' ? 'dark' : 'light';
  const [preference, setPreferenceState] = useState<VadThemePreference>('system');

  useEffect(() => {
    try {
      const stored = globalThis.localStorage?.getItem(THEME_PREFERENCE_KEY) ?? null;
      if (isThemePreference(stored)) setPreferenceState(stored);
    } catch {
      // Theme preference remains system-controlled if local persistence is unavailable.
    }
  }, []);

  const setPreference = useCallback((next: VadThemePreference) => {
    setPreferenceState(next);
    try {
      globalThis.localStorage?.setItem(THEME_PREFERENCE_KEY, next);
    } catch {
      // The selected theme still applies for the current session.
    }
  }, []);

  const resolvedMode: VadThemeMode = preference === 'system' ? systemMode : preference;

  const value = useMemo<VadThemeContextValue>(
    () => ({
      ...makeVadTheme(resolvedMode),
      preference,
      systemMode,
      setPreference,
    }),
    [preference, resolvedMode, setPreference, systemMode],
  );

  return <VadThemeContext.Provider value={value}>{children}</VadThemeContext.Provider>;
}

export function useVadTheme() {
  const theme = useContext(VadThemeContext);
  if (!theme) throw new Error('useVadTheme must be used within VadThemeProvider.');
  return theme;
}
