import { createContext, type PropsWithChildren, useContext } from 'react';

import { useAdminDashboard } from '@/features/admin/dashboard/use-admin-dashboard';
import type { AdminAccess } from '@/services/admin-control-api';

type AdminDataValue = ReturnType<typeof useAdminDashboard>;

const AdminDataContext = createContext<AdminDataValue | null>(null);

export function AdminDataProvider({
  access,
  children,
}: PropsWithChildren<{ access: AdminAccess }>) {
  const data = useAdminDashboard(access);
  return (
    <AdminDataContext.Provider value={data}>
      {children}
    </AdminDataContext.Provider>
  );
}

export function useAdminData() {
  const context = useContext(AdminDataContext);
  if (!context) {
    throw new Error('useAdminData must be used within AdminDataProvider.');
  }
  return context;
}
