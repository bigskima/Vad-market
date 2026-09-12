import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { OperationsRow, OperationsSection } from '@/features/admin/operations/operations-section';
import { useVadTheme } from '@/providers/theme-provider';
import {
  assignAdminRole,
  getAdminRoleAssignments,
  getAdminRoleCatalog,
  getAdminUsers,
  revokeAdminRole,
  type AdminRoleAssignmentRow,
  type AdminRoleCatalogRow,
  type AdminUserRow,
} from '@/services/admin-control-api';

export function AdminRolesScreen() {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [roles, setRoles] = useState<AdminRoleCatalogRow[]>([]);
  const [assignments, setAssignments] = useState<AdminRoleAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<AdminUserRow[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [userSearchError, setUserSearchError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [selectedRole, setSelectedRole] = useState<AdminRoleCatalogRow | null>(null);
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<AdminRoleAssignmentRow | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    setError(null);
    try {
      const [roleRows, assignmentRows] = await Promise.all([
        getAdminRoleCatalog(),
        getAdminRoleAssignments(),
      ]);
      setRoles(roleRows);
      setAssignments(assignmentRows);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Role administration could not be loaded.');
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const query = userSearch.trim();
    if (!assignOpen || query.length < 2) return undefined;

    let cancelled = false;
    const timer = setTimeout(() => {
      setSearchingUsers(true);
      setUserSearchError(null);
      void getAdminUsers(20, query)
        .then((rows) => {
          if (!cancelled) setUserResults(rows);
        })
        .catch((value) => {
          if (!cancelled) {
            setUserResults([]);
            setUserSearchError(value instanceof Error ? value.message : 'We could not search users right now.');
          }
        })
        .finally(() => {
          if (!cancelled) setSearchingUsers(false);
        });
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [assignOpen, userSearch]);

  const assignableRoles = useMemo(() => roles.filter((role) => role.role_code !== 'SUPER_ADMIN'), [roles]);

  const dualControl = useMemo(() => {
    const providerOperators = new Set<string>();
    const oracleReviewers = new Set<string>();
    assignments.forEach((row) => {
      if (row.role_code === 'SUPER_ADMIN' || row.role_code === 'PROVIDER_ADMIN') providerOperators.add(row.user_id);
      if (row.role_code === 'SUPER_ADMIN' || row.role_code === 'ORACLE_REVIEWER') oracleReviewers.add(row.user_id);
    });
    return { providerOperators: providerOperators.size, oracleReviewers: oracleReviewers.size, ready: providerOperators.size >= 2 && oracleReviewers.size >= 2 };
  }, [assignments]);

  const filteredAssignments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return assignments;
    return assignments.filter((row) =>
      [row.email, row.display_name, row.role_name, row.role_code]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [assignments, search]);

  function openAssignment(defaultReason = '') {
    setSelectedUser(null);
    setSelectedRole(null);
    setUserSearch('');
    setUserResults([]);
    setUserSearchError(null);
    setSearchingUsers(false);
    setReason(defaultReason);
    setActionError(null);
    setAssignOpen(true);
  }

  function closeAssignment() {
    if (working) return;
    setAssignOpen(false);
    setSelectedUser(null);
    setSelectedRole(null);
    setUserSearch('');
    setUserResults([]);
    setUserSearchError(null);
    setSearchingUsers(false);
    setReason('');
    setActionError(null);
  }

  function changeUserSearch(value: string) {
    setUserSearch(value);
    setSelectedUser(null);
    setUserResults([]);
    setUserSearchError(null);
    setSearchingUsers(value.trim().length >= 2);
    setActionError(null);
  }

  async function grantRole() {
    if (!selectedUser || !selectedRole || reason.trim().length < 3) return;
    setWorking(true);
    setActionError(null);
    setMessage(null);
    try {
      await assignAdminRole({ userId: selectedUser.user_id, roleCode: selectedRole.role_code, reason });
      setMessage(`${selectedRole.role_name} was assigned to ${selectedUser.email ?? selectedUser.display_name ?? 'the selected user'}.`);
      setAssignOpen(false);
      setSelectedUser(null);
      setSelectedRole(null);
      setUserSearch('');
      setUserResults([]);
      setReason('');
      await load(true);
    } catch (value) {
      setActionError(value instanceof Error ? value.message : 'Role could not be assigned.');
    } finally {
      setWorking(false);
    }
  }

  async function revokeRole() {
    if (!selectedAssignment || revokeReason.trim().length < 3) return;
    setWorking(true);
    setActionError(null);
    setMessage(null);
    try {
      await revokeAdminRole(selectedAssignment.assignment_id, revokeReason);
      setMessage(`${selectedAssignment.role_name} was revoked.`);
      setSelectedAssignment(null);
      setRevokeReason('');
      await load(true);
    } catch (value) {
      setActionError(value instanceof Error ? value.message : 'Role could not be revoked.');
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return <View style={{ gap: theme.spacing.md }}><VadSkeleton width="52%" height={32} /><VadSkeleton height={110} /><VadSkeleton height={70} /><VadSkeleton height={70} /></View>;
  }

  if (error && !roles.length && !assignments.length) {
    return <VadErrorState title="Role administration unavailable" message={error} onRetry={() => void load()} />;
  }

  return (
    <View style={{ gap: theme.spacing.xxxl }}>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.xl }}>
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="label" tone="brand">SUPER ADMIN</VadText>
          <VadText variant="title">Roles & operational authority.</VadText>
          <VadText tone="secondary">Assign scoped operational roles without sharing Super Admin access. Every grant and revocation is written to the audit ledger.</VadText>
        </View>
        <View style={{ flex: wide ? 0.8 : undefined, gap: theme.spacing.sm, justifyContent: 'center' }}>
          <VadButton label="Assign operational role" onPress={() => openAssignment()} />
          <VadButton label="Refresh roles" variant="secondary" loading={refreshing} onPress={() => void load(true)} />
        </View>
      </View>

      {message ? <View style={{ borderLeftWidth: 3, borderLeftColor: theme.colors.yes, backgroundColor: theme.colors.yesSoft, padding: theme.spacing.md }}><VadText variant="caption" tone="yes">{message}</VadText></View> : null}
      {error ? <VadErrorState title="Some role data is stale" message={error} onRetry={() => void load(true)} /> : null}

      <View style={{ borderWidth: 1, borderColor: dualControl.ready ? theme.colors.yes : theme.colors.warning, backgroundColor: dualControl.ready ? theme.colors.yesSoft : theme.colors.warningSoft, padding: theme.spacing.lg, gap: theme.spacing.md }}>
        <View style={{ gap: 3 }}>
          <VadText variant="caption" tone={dualControl.ready ? 'yes' : 'warning'}>PRODUCTION DUAL CONTROL</VadText>
          <VadText variant="heading">Independent approval coverage</VadText>
          <VadText variant="caption" tone="secondary">Production provider activation and Oracle fallback must not depend on one administrator. Use a second trusted VAD account instead of sharing Super Admin access.</VadText>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg }}>
          <View style={{ minWidth: 150, flexGrow: 1, gap: 2 }}><VadText variant="heading" tone={dualControl.providerOperators >= 2 ? 'yes' : 'warning'}>{dualControl.providerOperators}/2</VadText><VadText variant="caption" tone="secondary">Provider approvers</VadText></View>
          <View style={{ minWidth: 150, flexGrow: 1, gap: 2 }}><VadText variant="heading" tone={dualControl.oracleReviewers >= 2 ? 'yes' : 'warning'}>{dualControl.oracleReviewers}/2</VadText><VadText variant="caption" tone="secondary">Oracle reviewers</VadText></View>
        </View>
        {!dualControl.ready ? (
          <>
            <VadText variant="caption" tone="secondary">Assign both Provider Admin and Oracle Reviewer to the same second trusted operator, or distribute those roles across separate trusted operators.</VadText>
            <VadButton label="Assign launch reviewer" size="small" fullWidth={false} onPress={() => openAssignment('Production dual-control coverage')} style={{ alignSelf: 'flex-start' }} />
          </>
        ) : <VadText variant="bodyStrong" tone="yes">Independent provider and Oracle review coverage is ready.</VadText>}
      </View>

      <OperationsSection title="Role catalogue" description="Super Admin is intentionally excluded from ordinary assignment." count={roles.length}>
        {roles.map((role) => <OperationsRow key={role.role_code} title={role.role_name} detail={role.description} meta={`${role.assigned_count} active assignment${Number(role.assigned_count) === 1 ? '' : 's'}`} status={role.role_code === 'SUPER_ADMIN' ? 'PROTECTED' : 'ASSIGNABLE'} ready={role.role_code !== 'SUPER_ADMIN'} />)}
      </OperationsSection>

      <View style={{ gap: theme.spacing.sm }}>
        <VadInput label="Search assignments" value={search} onChangeText={setSearch} placeholder="Email, name or role" />
        <OperationsSection title="Active assignments" description="Select a scoped assignment to revoke it." count={filteredAssignments.length}>
          {filteredAssignments.length ? filteredAssignments.map((row) => (
            <OperationsRow key={String(row.assignment_id)} title={`${row.role_name} · ${row.display_name ?? row.email ?? 'User'}`} detail={row.email ?? row.user_id} meta={row.expires_at ? `Expires ${new Date(row.expires_at).toLocaleString()}` : 'No scheduled expiry'} status={row.role_code === 'SUPER_ADMIN' ? 'PROTECTED' : 'ACTIVE'} ready actionLabel={row.role_code === 'SUPER_ADMIN' ? undefined : 'Revoke'} onPress={row.role_code === 'SUPER_ADMIN' ? undefined : () => { setSelectedAssignment(row); setRevokeReason(''); setActionError(null); }} />
          )) : <VadEmptyState title="No matching role assignments" body="Change the search or assign a scoped role." />}
        </OperationsSection>
      </View>

      <VadBottomSheet visible={assignOpen} title="Assign operational role" onClose={closeAssignment}>
        <View style={{ gap: theme.spacing.lg }}>
          <VadText variant="caption" tone="secondary">Search for the person first, then choose the scoped role they need. VAD does not preload the user directory.</VadText>

          <View style={{ gap: theme.spacing.sm }}>
            <VadInput
              label="Find user"
              value={userSearch}
              onChangeText={changeUserSearch}
              placeholder="Search name or email"
              autoCapitalize="none"
              hint="Enter at least 2 characters. Up to 20 matching accounts are shown."
            />
            {searchingUsers ? <VadSkeleton height={62} radius={theme.radius.md} /> : null}
            {userSearchError ? <VadErrorState title="User search unavailable" message={userSearchError} /> : null}
            {!searchingUsers && userSearch.trim().length < 2 ? <VadEmptyState title="Search for a user" body="No accounts are shown until you search by name or email." /> : null}
            {!searchingUsers && userSearch.trim().length >= 2 && !userResults.length && !userSearchError ? <VadEmptyState title="No matching account" body="Check the name or email and try again." /> : null}
            {userResults.map((user) => <Choice key={user.user_id} label={user.display_name ?? user.email ?? 'VAD user'} detail={user.email ?? user.country_code} selected={selectedUser?.user_id === user.user_id} onPress={() => setSelectedUser(user)} />)}
          </View>

          {selectedUser ? (
            <View style={{ borderWidth: 1, borderColor: theme.colors.brandPrimary, backgroundColor: theme.colors.brandSoft, padding: theme.spacing.md, gap: 2 }}>
              <VadText variant="caption" tone="brand">SELECTED USER</VadText>
              <VadText variant="bodyStrong">{selectedUser.display_name ?? selectedUser.email ?? 'VAD user'}</VadText>
              {selectedUser.email ? <VadText variant="caption" tone="secondary">{selectedUser.email}</VadText> : null}
            </View>
          ) : null}

          <View style={{ gap: theme.spacing.sm }}>
            <VadText variant="bodyStrong">Role</VadText>
            {assignableRoles.map((role) => <Choice key={role.role_code} label={role.role_name} detail={role.description} selected={selectedRole?.role_code === role.role_code} onPress={() => setSelectedRole(role)} />)}
          </View>
          <VadInput label="Reason" value={reason} onChangeText={(value) => { setReason(value); setActionError(null); }} placeholder="Why is this access required?" multiline />
          {actionError ? <VadErrorState title="Role action failed" message={actionError} /> : null}
          <VadButton label="Assign role" loading={working} disabled={!selectedUser || !selectedRole || reason.trim().length < 3} onPress={() => void grantRole()} />
        </View>
      </VadBottomSheet>

      <VadBottomSheet visible={Boolean(selectedAssignment)} title="Revoke operational role" onClose={() => { if (!working) setSelectedAssignment(null); }}>
        {selectedAssignment ? <View style={{ gap: theme.spacing.lg }}><View style={{ gap: 2 }}><VadText variant="heading">{selectedAssignment.role_name}</VadText><VadText variant="caption" tone="secondary">{selectedAssignment.email ?? selectedAssignment.user_id}</VadText></View><VadInput label="Revocation reason" value={revokeReason} onChangeText={(value) => { setRevokeReason(value); setActionError(null); }} placeholder="Why should this access be removed?" multiline />{actionError ? <VadErrorState title="Role action failed" message={actionError} /> : null}<VadButton label="Revoke role" variant="danger" loading={working} disabled={revokeReason.trim().length < 3} onPress={() => void revokeRole()} /></View> : null}
      </VadBottomSheet>
    </View>
  );
}

function Choice({ label, detail, selected, onPress }: { label: string; detail: string; selected: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => ({ borderWidth: 1, borderColor: selected ? theme.colors.brandPrimary : theme.colors.border, backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surfaceRaised, padding: theme.spacing.md, gap: 2, opacity: pressed ? 0.65 : 1 })}>
      <VadText variant="bodyStrong" tone={selected ? 'brand' : 'primary'}>{label}</VadText>
      <VadText variant="caption" tone="secondary">{detail}</VadText>
    </Pressable>
  );
}
