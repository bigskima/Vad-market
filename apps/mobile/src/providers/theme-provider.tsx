import { createContext, type PropsWithChildren, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { makeVadTheme, type VadTheme } from '@/theme/themes';

const VadThemeContext = createContext<VadTheme | null>(null);

export function VadThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const theme = useMemo(() => makeVadTheme(systemScheme === 'light' ? 'light' : 'dark'), [systemScheme]);
  return <VadThemeContext.Provider value={theme}>{children}</VadThemeContext.Provider>;
}

export function useVadTheme() {
  const theme = useContext(VadThemeContext);
  if (!theme) throw new Error('useVadTheme must be used within VadThemeProvider.');
  return theme;
}
