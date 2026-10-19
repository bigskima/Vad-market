import { breakpoints, motion, radius, spacing, typography, type VadThemeMode } from './tokens';

export const brand = {
  primary: '#5146E5',
  strong: '#3E35C4',
  accent: '#7C72F2',
} as const;

const shared = {
  brandPrimary: brand.primary,
  brandStrong: brand.strong,
  brandAccent: brand.accent,
  yes: '#22C55E',
  no: '#EF4444',
  warning: '#F59E0B',
  info: '#4DA3FF',
  danger: '#EF4444',
} as const;

export const darkColors = {
  ...shared,
  yes: '#22C55E',
  no: '#EF4444',
  background: '#0B0E14',
  surface: '#151A23',
  surfaceRaised: '#1D2430',
  surfaceMuted: '#222A38',
  textPrimary: '#FFFFFF',
  textSecondary: '#8A94A6',
  textTertiary: '#7D8799',
  textInverse: '#FFFFFF',
  border: '#293141',
  borderStrong: '#3A4558',
  brandSoft: '#25234D',
  onBrand: '#FFFFFF',
  yesSoft: '#172554',
  noSoft: '#3D222B',
  warningSoft: '#463717',
  infoSoft: '#142E4E',
  overlay: 'rgba(0,0,0,0.68)',
  welcomeBase: '#0B0E14',
  welcomeControlBorder: 'rgba(255,255,255,0.28)',
  welcomeControlSurface: 'rgba(11,14,20,0.34)',
} as const;

export const lightColors = {
  ...shared,
  yes: '#15803D',
  no: '#B91C1C',
  background: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceRaised: '#F2F4F7',
  surfaceMuted: '#EDF0F5',
  textPrimary: '#0B0E14',
  textSecondary: '#667085',
  textTertiary: '#8790AA',
  textInverse: '#FFFFFF',
  border: '#E5EAF6',
  borderStrong: '#D5DDF0',
  brandSoft: '#EFEDFF',
  onBrand: '#FFFFFF',
  yesSoft: '#DBEAFE',
  noSoft: '#FEE2E2',
  warningSoft: '#FFF4D8',
  infoSoft: '#E6F2FF',
  overlay: 'rgba(15,18,32,0.42)',
  welcomeBase: '#0B0E14',
  welcomeControlBorder: 'rgba(255,255,255,0.38)',
  welcomeControlSurface: 'rgba(11,14,20,0.46)',
} as const;

const shadows = {
  subtle: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.025,
    shadowRadius: 8,
    elevation: 1,
  },
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.035,
    shadowRadius: 12,
    elevation: 1,
  },
  floating: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
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
