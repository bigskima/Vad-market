import { useWindowDimensions } from 'react-native';

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
    cardPadding: phone ? (compact ? 12 : 14) : 20,
    cardRadius: phone ? 18 : 22,
    controlHeight: phone ? 46 : 50,
    smallControlHeight: 44,
    largeControlHeight: phone ? 50 : 56,
    horizontalPadding: phone ? (narrow ? 12 : 16) : 24,
    pageTopPadding: phone ? (compact ? 12 : 16) : 24,
    sectionGap: phone ? (compact ? 16 : 20) : 28,
    contentBottomPadding: phone ? 96 : 48,
  } as const;
}
