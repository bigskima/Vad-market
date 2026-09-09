import { createContext, type PropsWithChildren, useContext } from 'react';

import { useAdminDashboard } from '@/features/admin/dashboard/use-admin-dashboard';

type AdminDataValue = ReturnType<typeof useAdminDashboard>;

const AdminDataContext = createContext<AdminDataValue | null>(null);

export function AdminDataProvider({ children }: PropsWithChildren) {
  const data = useAdminDashboard();
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
