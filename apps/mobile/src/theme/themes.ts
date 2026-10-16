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
  yes: '#168A61',
  no: '#D94B5B',
  warning: '#F5B942',
  info: '#4DA3FF',
  danger: '#E5485D',
} as const;

export const darkColors = {
  ...shared,
  background: '#0D1017',
  surface: '#141923',
  surfaceRaised: '#1A202C',
  surfaceMuted: '#222A38',
  textPrimary: '#F4F5FA',
  textSecondary: '#AAB1C0',
  textTertiary: '#7D8799',
  textInverse: '#FFFFFF',
  border: '#293141',
  borderStrong: '#3A4558',
  brandSoft: '#25234D',
  onBrand: '#FFFFFF',
  yesSoft: '#15392F',
  noSoft: '#3D222B',
  warningSoft: '#463717',
  infoSoft: '#142E4E',
  overlay: 'rgba(0,0,0,0.68)',
} as const;

export const lightColors = {
  ...shared,
  background: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceRaised: '#F3F5F8',
  surfaceMuted: '#EDEFF4',
  textPrimary: '#171A27',
  textSecondary: '#62697A',
  textTertiary: '#858B9B',
  textInverse: '#FFFFFF',
  border: '#E3E6ED',
  borderStrong: '#D2D7E2',
  brandSoft: '#EFEDFF',
  onBrand: '#FFFFFF',
  yesSoft: '#E3F5EC',
  noSoft: '#FBE9EC',
  warningSoft: '#FFF4D8',
  infoSoft: '#E6F2FF',
  overlay: 'rgba(15,18,32,0.42)',
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
