import { Redirect } from 'expo-router';
import type { PropsWithChildren } from 'react';

import { useAdminData } from '@/providers/admin-data-provider';

export function AdminSuperAdminGate({ children }: PropsWithChildren) {
  const data = useAdminData();

  if (!data.access.isSuperAdmin) {
    return <Redirect href="/admin" />;
  }

  return children;
}
