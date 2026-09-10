import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getAdminUsers,
  hasAdminPermission,
  setAdminUserStatus,
  type AdminUserRow,
} from '@/services/admin-control-api';

type AccountStatus = AdminUserRow['status'];

const actions: { status: AccountStatus; label: string; detail: string }[] = [
  {
    status: 'UNDER_REVIEW',
    label: 'Place under review',
    detail: 'Pause normal account access while an operator investigates.',
  },
  {
    status: 'RESTRICTED',
    label: 'Restrict account',
    detail: 'Block normal product actions until the restriction is lifted.',
  },
  {
    status: 'SUSPENDED',
    label: 'Suspend account',
    detail: 'Suspend access and cancel any still-open orders safely.',
  },
  {
    status: 'BANNED',
    label: 'Ban account',
    detail: 'Block the account and cancel open orders. Historical records remain auditable.',
  },
  {
    status: 'DEACTIVATED',
    label: 'Deactivate account',
    detail: 'Remove active access without deleting ledger, settlement or audit history.',
  },
  {
    status: 'ACTIVE',
    label: 'Reactivate account',
    detail: 'Restore normal access after the underlying issue is resolved.',
  },
];

export function AdminUsersScreen() {
  const theme = useVadTheme();
  const data = useAdminData();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const canManage = hasAdminPermission(data.access, 'users.manage');
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [targetStatus, setTargetStatus] = useState<AccountStatus | null>(null);
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (background = false, query = search) => {
    if (background) setRefreshing(true);
    setError(null);
    try {
      setRows(await getAdminUsers(100, query));
    } catch (reasonValue) {
      setError(
        reasonValue instanceof Error
          ? reasonValue.message
          : 'User operations could not be loaded.',
      );
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => void load(false, ''), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const counts = useMemo(() => {
    const summary = {
      active: 0,
      review: 0,
      restricted: 0,
      suspended: 0,
      banned: 0,
    };

    rows.forEach((row) => {
      if (row.status === 'ACTIVE') summary.active += 1;
      else if (row.status === 'UNDER_REVIEW') summary.review += 1;
      else if (row.status === 'RESTRICTED') summary.restricted += 1;
      else if (row.status === 'SUSPENDED') summary.suspended += 1;
      else if (row.status === 'BANNED') summary.banned += 1;
    });

    return summary;
  }, [rows]);

  async function applyStatus() {
    if (!selected || !targetStatus || reason.trim().length < 3) return;

    setWorking(true);
    setActionError(null);
    try {
      await setAdminUserStatus({
        userId: selected.user_id,
        status: targetStatus,
        reason,
      });
      setSelected(null);
      setTargetStatus(null);
      setReason('');
      await load(true);
      await data.refresh();
    } catch (reasonValue) {
      setActionError(
        reasonValue instanceof Error
          ? reasonValue.message
          : 'Account action could not be completed.',
      );
    } finally {
      setWorking(false);
    }
  }

  function open(row: AdminUserRow) {
    if (!canManage) return;
    setSelected(row);
    setTargetStatus(null);
    setReason('');
    setActionError(null);
  }

  return (
    <View style={{ gap: theme.spacing.xxxl }}>
      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.xl,
          alignItems: wide ? 'flex-end' : 'stretch',
        }}
      >
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="label" tone="brand">USER OPERATIONS</VadText>
          <VadText variant="title">Account access & safety.</VadText>
          <VadText tone="secondary">
            Risk operators can review, restrict, suspend, ban, deactivate and
            reactivate accounts. Support-only roles can inspect without gaining
            mutation privileges.
          </VadText>
        </View>

        <VadButton
          label="Refresh"
          variant="secondary"
          size="small"
          fullWidth={!wide}
          loading={refreshing}
          onPress={() => void load(true)}
        />
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
        }}
      >
        <Summary label="Active" value={counts.active} tone="yes" />
        <Summary label="Under review" value={counts.review} tone="warning" />
        <Summary label="Restricted" value={counts.restricted} tone="warning" />
        <Summary label="Suspended" value={counts.suspended} tone="danger" />
        <Summary label="Banned" value={counts.banned} tone="danger" />
      </View>

      <View
        style={{
          flexDirection: width >= 720 ? 'row' : 'column',
          gap: theme.spacing.sm,
          alignItems: 'stretch',
        }}
      >
        <View style={{ flex: 1 }}>
          <VadInput
            label="Find account"
            value={search}
            onChangeText={setSearch}
            placeholder="Email, name, handle or user ID"
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => void load(false)}
          />
        </View>
        <VadButton
          label="Search"
          variant="secondary"
          fullWidth={width < 720}
          onPress={() => void load(false)}
          style={width >= 720 ? { alignSelf: 'flex-end', minWidth: 110 } : undefined}
        />
      </View>

      {loading ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadSkeleton height={76} />
          <VadSkeleton height={76} />
          <VadSkeleton height={76} />
        </View>
      ) : error && !rows.length ? (
        <VadErrorState
          title="User operations unavailable"
          message={error}
          onRetry={() => {
            setLoading(true);
            void load(false);
          }}
        />
      ) : rows.length ? (
        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          {rows.map((row) => (
            <Pressable
              key={row.user_id}
              accessibilityRole={canManage ? 'button' : undefined}
              accessibilityLabel={canManage ? `Manage ${row.email ?? row.display_name ?? 'user'}` : undefined}
              disabled={!canManage}
              onPress={() => open(row)}
              style={({ pressed }) => ({
                minHeight: 82,
                paddingVertical: theme.spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <VadText variant="bodyStrong" numberOfLines={1}>
                  {row.display_name || row.handle || row.email || 'VAD member'}
                </VadText>
                <VadText variant="caption" tone="secondary" numberOfLines={1}>
                  {row.email ?? row.user_id}
                </VadText>
                <VadText variant="caption" tone="tertiary" numberOfLines={1}>
                  {row.country_code} · joined {new Date(row.created_at).toLocaleDateString()}
                  {row.latest_action_reason ? ` · ${row.latest_action_reason}` : ''}
                </VadText>
              </View>

              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <StatusBadge status={row.status} />
                {canManage ? (
                  <VadText variant="caption" tone="brand">Manage</VadText>
                ) : (
                  <VadText variant="caption" tone="tertiary">Read only</VadText>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <VadEmptyState
          title="No accounts found"
          body="Try another email, handle, name or user ID."
          actionLabel={search ? 'Clear search' : undefined}
          onAction={search ? () => {
            setSearch('');
            void load(false, '');
          } : undefined}
        />
      )}

      {error && rows.length ? (
        <VadErrorState
          title="Account list refresh failed"
          message={error}
          onRetry={() => void load(true)}
        />
      ) : null}

      <VadBottomSheet
        visible={Boolean(selected)}
        title="Account action"
        onClose={() => {
          if (!working) setSelected(null);
        }}
      >
        {selected ? (
          <View style={{ gap: theme.spacing.lg }}>
            <View style={{ gap: 2 }}>
              <VadText variant="bodyStrong">
                {selected.display_name || selected.handle || selected.email || 'VAD member'}
              </VadText>
              <VadText variant="caption" tone="secondary">
                {selected.email ?? selected.user_id}
              </VadText>
              <VadText variant="caption" tone="tertiary">
                Current status: {selected.status.replaceAll('_', ' ')}
              </VadText>
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
              {actions.map((action) => {
                const disabled = action.status === selected.status;
                const chosen = targetStatus === action.status;
                return (
                  <Pressable
                    key={action.status}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: chosen, disabled }}
                    disabled={disabled || working}
                    onPress={() => setTargetStatus(action.status)}
                    style={({ pressed }) => ({
                      minHeight: 68,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.border,
                      paddingVertical: theme.spacing.sm,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.md,
                      opacity: disabled ? 0.4 : pressed ? 0.65 : 1,
                    })}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <VadText
                        variant="bodyStrong"
                        tone={chosen ? 'brand' : 'primary'}
                      >
                        {action.label}
                      </VadText>
                      <VadText variant="caption" tone="secondary">
                        {action.detail}
                      </VadText>
                    </View>
                    {chosen ? <VadText tone="brand">✓</VadText> : null}
                  </Pressable>
                );
              })}
            </View>

            <VadInput
              label="Reason"
              value={reason}
              onChangeText={(value) => {
                setReason(value);
                setActionError(null);
              }}
              placeholder="Why is this account action required?"
              multiline
              error={reason.length > 0 && reason.trim().length < 3 ? 'Enter at least 3 characters.' : undefined}
            />

            {targetStatus && ['SUSPENDED', 'BANNED', 'DEACTIVATED'].includes(targetStatus) ? (
              <View
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: theme.colors.warning,
                  backgroundColor: theme.colors.warningSoft,
                  padding: theme.spacing.md,
                  gap: 2,
                }}
              >
                <VadText variant="caption" tone="warning">OPEN ORDERS</VadText>
                <VadText variant="caption" tone="secondary">
                  Open orders are cancelled and unused reservations are released before the account status changes.
                </VadText>
              </View>
            ) : null}

            {actionError ? (
              <VadErrorState title="Action failed" message={actionError} />
            ) : null}

            <VadButton
              label={targetStatus ? actions.find((action) => action.status === targetStatus)?.label ?? 'Apply action' : 'Choose an action'}
              variant={targetStatus === 'BANNED' || targetStatus === 'DEACTIVATED' ? 'danger' : 'primary'}
              loading={working}
              disabled={!targetStatus || reason.trim().length < 3}
              onPress={() => void applyStatus()}
            />
          </View>
        ) : null}
      </VadBottomSheet>
    </View>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'yes' | 'warning' | 'danger';
}) {
  const theme = useVadTheme();
  return (
    <View
      style={{
        minWidth: 120,
        flexGrow: 1,
        flexBasis: 130,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
        paddingVertical: theme.spacing.sm,
        gap: 2,
      }}
    >
      <VadText variant="heading" tone={value ? tone : 'primary'}>{value}</VadText>
      <VadText variant="caption" tone="secondary">{label}</VadText>
    </View>
  );
}

function StatusBadge({ status }: { status: AccountStatus }) {
  const theme = useVadTheme();
  const tone = status === 'ACTIVE'
    ? 'yes'
    : status === 'UNDER_REVIEW' || status === 'RESTRICTED'
      ? 'warning'
      : 'danger';
  const backgroundColor = tone === 'yes'
    ? theme.colors.yesSoft
    : tone === 'warning'
      ? theme.colors.warningSoft
      : theme.colors.noSoft;

  return (
    <View
      style={{
        borderRadius: theme.radius.pill,
        backgroundColor,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
      }}
    >
      <VadText variant="caption" tone={tone}>
        {status.replaceAll('_', ' ')}
      </VadText>
    </View>
  );
}
