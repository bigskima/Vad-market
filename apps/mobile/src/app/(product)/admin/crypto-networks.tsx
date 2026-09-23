import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminCryptoNetworksScreen } from '@/features/admin/sections/admin-crypto-networks-screen';

export default function AdminCryptoNetworksRoute() {
  return (
    <AdminPermissionGate permissions={['assets.manage', 'markets.manage']}>
      <AdminRouteContainer>
        <AdminCryptoNetworksScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
