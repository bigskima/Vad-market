export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const typography = {
  display: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '800' as const,
    letterSpacing: -0.25,
  },
  heading: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '700' as const,
    letterSpacing: -0.1,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400' as const,
  },
  bodyStrong: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600' as const,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700' as const,
    letterSpacing: 0.1,
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500' as const,
  },
} as const;

export type VadThemeMode = 'light' | 'dark';
export type VadThemePreference = 'system' | VadThemeMode;
