import { breakpoints, motion, radius, spacing, typography, type VadThemeMode } from './tokens';

export const brand = {
  primary: '#5B5BF7',
  strong: '#4949DD',
  accent: '#7C6CFF',
} as const;

const shared = {
  brandPrimary: brand.primary,
  brandStrong: brand.strong,
  brandAccent: brand.accent,
  yes: '#20C77A',
  no: '#F05B6A',
  warning: '#F5B942',
  info: '#4DA3FF',
  danger: '#E5485D',
} as const;

export const darkColors = {
  ...shared,
  background: '#080A12',
  surface: '#10131E',
  surfaceRaised: '#171B28',
  surfaceMuted: '#1E2332',
  textPrimary: '#F7F7FB',
  textSecondary: '#A8ADBD',
  textTertiary: '#777E91',
  textInverse: '#FFFFFF',
  border: '#262C3D',
  borderStrong: '#3B4358',
  brandSoft: '#20204D',
  onBrand: '#FFFFFF',
  yesSoft: '#123B2D',
  noSoft: '#451E27',
  warningSoft: '#463717',
  infoSoft: '#142E4E',
  overlay: 'rgba(0,0,0,0.68)',
} as const;

export const lightColors = {
  ...shared,
  background: '#F7F8FC',
  surface: '#FFFFFF',
  surfaceRaised: '#F0F2F8',
  surfaceMuted: '#E8EBF3',
  textPrimary: '#0F1220',
  textSecondary: '#60677A',
  textTertiary: '#858CA0',
  textInverse: '#FFFFFF',
  border: '#E1E4EC',
  borderStrong: '#C9CEDB',
  brandSoft: '#E8E8FF',
  onBrand: '#FFFFFF',
  yesSoft: '#E1F8EE',
  noSoft: '#FDE8EB',
  warningSoft: '#FFF4D8',
  infoSoft: '#E6F2FF',
  overlay: 'rgba(15,18,32,0.42)',
} as const;

const shadows = {
  subtle: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 4,
  },
  floating: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 34,
    elevation: 8,
  },
} as const;

export function makeVadTheme(mode: VadThemeMode) {
  return {
    mode,
    colors: mode === 'dark' ? darkColors : lightColors,
    spacing,
    radius,
    typography,
    breakpoints,
    motion,
    shadows,
  };
}

export type VadTheme = ReturnType<typeof makeVadTheme>;
