import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';
import { AdminCommandBar } from './admin-command-bar';
import { AdminMobileNavigation } from './admin-mobile-navigation';
import { AdminSidebar } from './admin-sidebar';
import { useAdminResponsive } from './use-admin-responsive';

export function AdminShell({
  children,
  onExit,
}: PropsWithChildren<{ onExit: () => void }>) {
  const theme = useVadTheme();
  const responsive = useAdminResponsive();

  return (
    <View
      style={{
        flex: 1,
        flexDirection: responsive.desktop ? 'row' : 'column',
        backgroundColor: theme.colors.background,
      }}
    >
      {responsive.desktop ? <AdminSidebar onExit={onExit} /> : null}

      <View style={{ flex: 1, minWidth: 0 }}>
        <AdminCommandBar onExit={onExit} />
        <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
        {!responsive.desktop ? <AdminMobileNavigation /> : null}
      </View>
    </View>
  );
}
