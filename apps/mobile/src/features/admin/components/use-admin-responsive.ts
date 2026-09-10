import { useWindowDimensions } from 'react-native';

export type AdminViewport = 'mobile' | 'tablet' | 'desktop' | 'wide';

export function useAdminResponsive() {
  const { width, height } = useWindowDimensions();

  const viewport: AdminViewport =
    width < 720
      ? 'mobile'
      : width < 1024
        ? 'tablet'
        : width < 1440
          ? 'desktop'
          : 'wide';

  const mobile = viewport === 'mobile';
  const tablet = viewport === 'tablet';
  const desktop = viewport === 'desktop' || viewport === 'wide';
  const wide = viewport === 'wide';
  const compactSidebar = desktop && width < 1220;

  return {
    width,
    height,
    viewport,
    mobile,
    tablet,
    desktop,
    wide,
    compactSidebar,
    sidebarWidth: compactSidebar ? 104 : 268,
    contentMaxWidth: wide ? 1480 : 1280,
  } as const;
}
