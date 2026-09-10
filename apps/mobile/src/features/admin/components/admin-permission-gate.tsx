import { Redirect } from 'expo-router';
import type { PropsWithChildren } from 'react';

import { useAdminData } from '@/providers/admin-data-provider';
import { hasAnyAdminPermission } from '@/services/admin-control-api';

export function AdminPermissionGate({
  permissions,
  children,
}: PropsWithChildren<{ permissions: string[] }>) {
  const data = useAdminData();

  if (!hasAnyAdminPermission(data.access, permissions)) {
    return <Redirect href="/admin" />;
  }

  return children;
}
