import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminPolicyEditorScreen } from '@/features/admin/policy/admin-policy-editor-screen';

export default function AdminPoliciesRoute() {
  return (
    <AdminPermissionGate permissions={['policies.manage']}>
      <AdminRouteContainer>
        <AdminPolicyEditorScreen />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
