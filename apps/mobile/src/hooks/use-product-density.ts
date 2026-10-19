import { useWindowDimensions } from 'react-native';

import { radius, spacing } from '@/theme/tokens';

/**
 * Shared density rules for the consumer product surface.
 * Mobile ends at the md breakpoint so tablet/desktop layouts never become a
 * stretched phone UI. Interactive controls remain at least 44px high.
 */
export function useProductDensity() {
  const { width, height } = useWindowDimensions();
  const phone = width < 768;
  const tablet = width >= 768 && width < 1280;
  const desktop = width >= 768;
  const wide = width >= 1280;
  const ultraWide = width >= 1536;
  const narrow = width < 380;
  const short = height < 760;
  const compact = phone && (narrow || short);

  return {
    width,
    height,
    phone,
    tablet,
    desktop,
    wide,
    ultraWide,
    narrow,
    short,
    compact,
    cardPadding: phone ? (compact ? spacing.sm : spacing.md) : spacing.xl,
    cardRadius: radius.lg,
    controlHeight: phone ? 44 : 48,
    smallControlHeight: 44,
    largeControlHeight: phone ? 48 : 56,
    horizontalPadding: phone ? (narrow ? spacing.sm : spacing.md) : spacing.xl,
    pageTopPadding: phone ? (compact ? spacing.sm : spacing.md) : spacing.xl,
    sectionGap: phone ? (compact ? spacing.md : spacing.xl) : spacing.xl,
    contentBottomPadding: phone ? 96 : 48,
  } as const;
}
