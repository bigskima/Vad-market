import { useWindowDimensions } from 'react-native';

/**
 * Shared density rules for the consumer product surface.
 *
 * Small phones should not feel like a tablet UI compressed into a narrow
 * viewport. We keep interactive targets usable, but reduce padding, gaps and
 * decorative height when either width or usable height is constrained.
 */
export function useProductDensity() {
  const { width, height } = useWindowDimensions();
  const phone = width < 720;
  const tablet = width >= 720 && width < 900;
  const desktop = width >= 900;
  const narrow = width < 380;
  const short = height < 760;
  const compact = phone && (narrow || short);

  return {
    width,
    height,
    phone,
    tablet,
    desktop,
    narrow,
    short,
    compact,
    cardPadding: phone ? (compact ? 12 : 14) : 20,
    cardRadius: phone ? 16 : 20,
    controlHeight: phone ? (compact ? 42 : 44) : 50,
    smallControlHeight: phone ? 36 : 40,
    largeControlHeight: phone ? 48 : 56,
    horizontalPadding: phone ? (narrow ? 12 : 16) : 24,
    pageTopPadding: phone ? (compact ? 12 : 16) : 24,
    sectionGap: phone ? (compact ? 16 : 20) : 24,
    contentBottomPadding: phone ? 88 : 40,
  } as const;
}
