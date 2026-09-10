import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useAdminResponsive } from '@/features/admin/components/use-admin-responsive';
import { useVadTheme } from '@/providers/theme-provider';
import { getAdminUsers, type AdminUserRow } from '@/services/admin-control-api';
import {
  getAdminServiceControls,
  getAdminUserServiceControls,
  setAdminServiceControl,
  type AdminServiceControlRow,
  type AdminUserServiceControlRow,
} from '@/services/service-control-admin-api';

type PendingControl = {
  serviceKey: string;
  name: string;
  paused: boolean;
  user: AdminUserRow | null;
};

export function AdminServiceControlsScreen() {
  const theme = useVadTheme();
  const responsive = useAdminResponsive();
  const [services, setServices] = useState<AdminServiceControlRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [userControls, setUserControls] = useState<AdminUserServiceControlRow[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingControl | null>(null);
  const [reason, setReason] = useState('');
  const [autoResumeHours, setAutoResumeHours] = useState('');
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    setError(null);
    try {
      setServices(await getAdminServiceControls());
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : 'Service controls could not be loaded.',
      );
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  const loadUserControls = useCallback(async (user: AdminUserRow) => {
    setUserLoading(true);
    setUserError(null);
    try {
      setUserControls(await getAdminUserServiceControls(user.user_id));
    } catch (value) {
      setUserError(
        value instanceof Error
          ? value.message
          : 'User service controls could not be loaded.',
      );
      setUserControls([]);
    } finally {
      setUserLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, AdminServiceControlRow[]>();
    for (const service of services) {
      const current = map.get(service.category) ?? [];
      current.push(service);
      map.set(service.category, current);
    }
    return Array.from(map.entries());
  }, [services]);

  const activeGlobalPauses = services.filter((service) => service.global_paused).length;
  const activeUserPauses = services.reduce(
    (total, service) => total + Number(service.active_user_pauses || 0),
    0,
  );
  const maintenance = services.find((service) => service.service_key === 'app_access');

  async function findUsers() {
    const query = search.trim();
    if (query.length < 2) {
      setUserError('Enter at least 2 characters to search by email, name or handle.');
      return;
    }
    setSearching(true);
    setUserError(null);
    try {
      setUsers(await getAdminUsers(20, query));
    } catch (value) {
      setUserError(value instanceof Error ? value.message : 'User search failed.');
    } finally {
      setSearching(false);
    }
  }

  function chooseUser(user: AdminUserRow) {
    setSelectedUser(user);
    setUsers([]);
    setUserControls([]);
    void loadUserControls(user);
  }

  function openControl(
    serviceKey: string,
    name: string,
    paused: boolean,
    user: AdminUserRow | null = null,
  ) {
    setPending({ serviceKey, name, paused, user });
    setReason('');
    setAutoResumeHours('');
    setActionError(null);
  }

  async function applyControl() {
    if (!pending || reason.trim().length < 3) return;

    let resumesAt: string | null = null;
    if (pending.paused && autoResumeHours.trim()) {
      const hours = Number(autoResumeHours);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 8760) {
        setActionError('Auto-resume hours must be greater than 0 and no more than 8760.');
        return;
      }
      resumesAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    }

    setWorking(true);
    setActionError(null);
    try {
      await setAdminServiceControl({
        serviceKey: pending.serviceKey,
        paused: pending.paused,
        reason,
        resumesAt,
        userId: pending.user?.user_id ?? null,
      });

      const scopeText = pending.user
        ? ` for ${pending.user.email ?? pending.user.display_name ?? 'this user'}`
        : ' globally';
      setMessage(
        `${pending.name} ${pending.paused ? 'paused' : 'resumed'}${scopeText}. The control is effective immediately and was written to the audit trail.`,
      );
      setPending(null);
      setReason('');
      setAutoResumeHours('');
      await load(true);
      if (selectedUser) await loadUserControls(selectedUser);
    } catch (value) {
      setActionError(
        value instanceof Error ? value.message : 'Service control could not be changed.',
      );
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="48%" height={32} />
        <VadSkeleton height={128} radius={theme.radius.lg} />
        <VadSkeleton height={96} radius={theme.radius.lg} />
        <VadSkeleton height={96} radius={theme.radius.lg} />
      </View>
    );
  }

  if (error && !services.length) {
    return (
      <VadErrorState
        title="Service controls unavailable"
        message={error}
        onRetry={() => {
          setLoading(true);
          void load();
        }}
      />
    );
  }

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <View
        style={{
          flexDirection: responsive.desktop ? 'row' : 'column',
          alignItems: responsive.desktop ? 'flex-end' : 'stretch',
          gap: theme.spacing.lg,
        }}
      >
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="label" tone="warning">SUPER ADMIN · IMMEDIATE CONTROL</VadText>
          <VadText variant="title">Pause & resume VAD services.</VadText>
          <VadText tone="secondary">
            Emergency switches take effect immediately. They do not create a policy proposal and do not require maker-checker approval. Every change is audited.
          </VadText>
        </View>
        <VadButton
          label="Refresh controls"
          variant="secondary"
          size="small"
          fullWidth={false}
          loading={refreshing}
          onPress={() => void load(true)}
        />
      </View>

      <View
        style={{
          flexDirection: responsive.width >= 720 ? 'row' : 'column',
          gap: theme.spacing.sm,
        }}
      >
        <SummaryCard label="Global pauses" value={activeGlobalPauses} warning={activeGlobalPauses > 0} />
        <SummaryCard label="User-specific pauses" value={activeUserPauses} warning={activeUserPauses > 0} />
        <SummaryCard label="Services controlled" value={services.length} warning={false} />
      </View>

      {maintenance ? (
        <VadCard
          variant={maintenance.global_paused ? 'raised' : 'brand'}
          style={{
            borderColor: maintenance.global_paused ? theme.colors.warning : theme.colors.brandPrimary,
            gap: theme.spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: responsive.width >= 680 ? 'row' : 'column',
              gap: theme.spacing.md,
              alignItems: responsive.width >= 680 ? 'center' : 'stretch',
            }}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <VadText variant="heading">App maintenance</VadText>
                <VadChip
                  label={maintenance.global_paused ? 'READ-ONLY MAINTENANCE' : 'AVAILABLE'}
                  tone={maintenance.global_paused ? 'warning' : 'yes'}
                />
              </View>
              <VadText variant="caption" tone="secondary">
                Pausing this switch stops new user-initiated risk actions across VAD. Read-only access, order cancellation, provider callbacks and reconciliation stay available so maintenance cannot strand money or positions.
              </VadText>
              {maintenance.global_paused && maintenance.global_reason ? (
                <VadText variant="caption" tone="warning">{maintenance.global_reason}</VadText>
              ) : null}
              {maintenance.global_resumes_at ? (
                <VadText variant="caption" tone="tertiary">
                  Automatic resume: {new Date(maintenance.global_resumes_at).toLocaleString()}
                </VadText>
              ) : null}
            </View>
            <VadButton
              label={maintenance.global_paused ? 'Resume app actions' : 'Enter maintenance'}
              variant={maintenance.global_paused ? 'secondary' : 'danger'}
              fullWidth={!responsive.desktop}
              onPress={() => openControl(
                maintenance.service_key,
                maintenance.name,
                !maintenance.global_paused,
              )}
            />
          </View>
        </VadCard>
      ) : null}

      {message ? (
        <View
          accessibilityRole="alert"
          style={{
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.yes,
            backgroundColor: theme.colors.yesSoft,
            borderRadius: theme.radius.md,
            padding: theme.spacing.md,
            gap: 3,
          }}
        >
          <VadText variant="caption" tone="yes">CONTROL APPLIED</VadText>
          <VadText variant="caption" tone="secondary">{message}</VadText>
        </View>
      ) : null}

      {error ? (
        <VadErrorState
          title="Some control data may be stale"
          message={error}
          onRetry={() => void load(true)}
        />
      ) : null}

      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ gap: 3 }}>
          <VadText variant="heading">Global service switches</VadText>
          <VadText variant="caption" tone="secondary">
            Pause only the capability you need. Existing in-flight financial reconciliation is deliberately not switched off by deposit or withdrawal controls.
          </VadText>
        </View>

        {grouped.map(([category, rows]) => (
          <View key={category} style={{ gap: theme.spacing.sm }}>
            <VadText variant="label" tone="tertiary">{category.toUpperCase()}</VadText>
            <View
              style={{
                flexDirection: responsive.width >= 920 ? 'row' : 'column',
                flexWrap: responsive.width >= 920 ? 'wrap' : 'nowrap',
                gap: theme.spacing.sm,
              }}
            >
              {rows
                .filter((service) => service.service_key !== 'app_access')
                .map((service) => (
                  <ServiceCard
                    key={service.service_key}
                    service={service}
                    wide={responsive.width >= 920}
                    onChange={() => openControl(
                      service.service_key,
                      service.name,
                      !service.global_paused,
                    )}
                  />
                ))}
            </View>
          </View>
        ))}
      </View>

      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ gap: 3 }}>
          <VadText variant="heading">User-specific controls</VadText>
          <VadText variant="caption" tone="secondary">
            Pause all new actions for one account, or pause only a specific user-scopable service without suspending the account itself.
          </VadText>
        </View>

        <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
          <View
            style={{
              flexDirection: responsive.width >= 680 ? 'row' : 'column',
              alignItems: responsive.width >= 680 ? 'flex-end' : 'stretch',
              gap: theme.spacing.sm,
            }}
          >
            <View style={{ flex: 1 }}>
              <VadInput
                label="Find user"
                value={search}
                onChangeText={(value) => {
                  setSearch(value);
                  setUserError(null);
                }}
                placeholder="Email, display name or handle"
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={() => void findUsers()}
              />
            </View>
            <VadButton
              label="Search"
              variant="secondary"
              fullWidth={!responsive.desktop}
              loading={searching}
              onPress={() => void findUsers()}
            />
          </View>

          {users.length ? (
            <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
              {users.map((user) => (
                <Pressable
                  key={user.user_id}
                  accessibilityRole="button"
                  onPress={() => chooseUser(user)}
                  style={({ pressed }) => ({
                    minHeight: 56,
                    paddingVertical: theme.spacing.sm,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                    opacity: pressed ? 0.65 : 1,
                  })}
                >
                  <VadText variant="bodyStrong">
                    {user.display_name ?? user.email ?? user.handle ?? 'VAD user'}
                  </VadText>
                  <VadText variant="caption" tone="secondary">
                    {[user.email, user.handle ? `@${user.handle}` : null, user.status]
                      .filter(Boolean)
                      .join(' · ')}
                  </VadText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </VadCard>

        {userError ? <VadErrorState title="User control unavailable" message={userError} /> : null}

        {selectedUser ? (
          <View style={{ gap: theme.spacing.md }}>
            <VadCard variant="brand" style={{ gap: 3 }}>
              <VadText variant="label" tone="brand">SELECTED ACCOUNT</VadText>
              <VadText variant="heading">
                {selectedUser.display_name ?? selectedUser.email ?? 'VAD user'}
              </VadText>
              <VadText variant="caption" tone="secondary" selectable>
                {selectedUser.email ?? selectedUser.handle ?? selectedUser.user_id}
              </VadText>
            </VadCard>

            {userLoading ? (
              <View style={{ gap: theme.spacing.sm }}>
                <VadSkeleton height={72} radius={theme.radius.lg} />
                <VadSkeleton height={72} radius={theme.radius.lg} />
              </View>
            ) : userControls.length ? (
              <View style={{ gap: theme.spacing.sm }}>
                {userControls.map((control) => {
                  const inheritedAccountPause = control.reason_code === 'ACCOUNT_ACTIONS_PAUSED';
                  const globallyPaused = control.reason_code === 'SERVICE_PAUSED';
                  const directlyUserPaused = control.reason_code === 'ACCOUNT_SERVICE_PAUSED';
                  const canAct = !globallyPaused && !inheritedAccountPause;
                  const nextPause = control.enabled || !directlyUserPaused;

                  return (
                    <VadCard key={control.service_key} variant="raised" style={{ gap: theme.spacing.sm }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                        <View style={{ flex: 1, minWidth: 190, gap: 3 }}>
                          <VadText variant="bodyStrong">{control.name}</VadText>
                          <VadText variant="caption" tone="tertiary">{control.category}</VadText>
                          {!control.enabled && control.message ? (
                            <VadText variant="caption" tone="warning">{control.message}</VadText>
                          ) : null}
                          {inheritedAccountPause ? (
                            <VadText variant="caption" tone="secondary">
                              This service is paused because App maintenance is paused for this account. Resume that account-level control first.
                            </VadText>
                          ) : globallyPaused ? (
                            <VadText variant="caption" tone="secondary">
                              This service is globally paused. User-specific resume cannot override a global pause.
                            </VadText>
                          ) : null}
                        </View>
                        <VadChip
                          label={control.enabled ? 'AVAILABLE' : 'PAUSED'}
                          tone={control.enabled ? 'yes' : 'warning'}
                        />
                      </View>

                      {canAct ? (
                        <VadButton
                          label={directlyUserPaused ? 'Resume for user' : 'Pause for user'}
                          variant={directlyUserPaused ? 'secondary' : 'danger'}
                          size="small"
                          fullWidth={!responsive.desktop}
                          onPress={() => openControl(
                            control.service_key,
                            control.name,
                            !directlyUserPaused,
                            selectedUser,
                          )}
                        />
                      ) : null}
                    </VadCard>
                  );
                })}
              </View>
            ) : (
              <VadEmptyState
                title="No user-scopable controls"
                body="No controls are available for this account."
              />
            )}
          </View>
        ) : (
          <VadEmptyState
            title="Choose an account"
            body="Search for a user to view and change account-specific service availability."
          />
        )}
      </View>

      <VadBottomSheet
        visible={Boolean(pending)}
        title={pending?.paused ? 'Pause service' : 'Resume service'}
        onClose={() => {
          if (!working) setPending(null);
        }}
      >
        {pending ? (
          <View style={{ gap: theme.spacing.md }}>
            <VadCard variant={pending.paused ? 'raised' : 'brand'} style={{ gap: 3 }}>
              <VadText variant="label" tone={pending.paused ? 'warning' : 'brand'}>
                {pending.user ? 'USER-SPECIFIC CONTROL' : 'GLOBAL CONTROL'}
              </VadText>
              <VadText variant="heading">{pending.name}</VadText>
              <VadText variant="caption" tone="secondary">
                {pending.user
                  ? `${pending.paused ? 'Pause' : 'Resume'} immediately for ${pending.user.email ?? pending.user.display_name ?? pending.user.user_id}.`
                  : `${pending.paused ? 'Pause' : 'Resume'} immediately for all applicable accounts.`}
              </VadText>
            </VadCard>

            <VadInput
              label="Reason"
              value={reason}
              onChangeText={(value) => {
                setReason(value);
                setActionError(null);
              }}
              placeholder={pending.paused ? 'Why are you pausing this service?' : 'Why are you resuming this service?'}
              multiline
              error={reason.length > 0 && reason.trim().length < 3 ? 'Enter at least 3 characters.' : undefined}
            />

            {pending.paused ? (
              <VadInput
                label="Auto-resume after hours (optional)"
                value={autoResumeHours}
                onChangeText={(value) => {
                  setAutoResumeHours(value.replace(/[^0-9.]/g, ''));
                  setActionError(null);
                }}
                keyboardType="decimal-pad"
                placeholder="Leave blank for manual resume"
                hint="When the time expires, the backend treats the pause as resumed automatically."
              />
            ) : null}

            {actionError ? <VadErrorState title="Control change failed" message={actionError} /> : null}

            <VadButton
              label={pending.paused ? 'Pause immediately' : 'Resume immediately'}
              variant={pending.paused ? 'danger' : 'primary'}
              loading={working}
              disabled={reason.trim().length < 3}
              onPress={() => void applyControl()}
            />
          </View>
        ) : null}
      </VadBottomSheet>
    </View>
  );
}

function SummaryCard({ label, value, warning }: { label: string; value: number; warning: boolean }) {
  const theme = useVadTheme();
  return (
    <VadCard variant="raised" style={{ flex: 1, minWidth: 180, gap: 3 }}>
      <VadText variant="caption" tone="secondary">{label}</VadText>
      <VadText variant="title" tone={warning ? 'warning' : 'primary'}>{value}</VadText>
    </VadCard>
  );
}

function ServiceCard({
  service,
  wide,
  onChange,
}: {
  service: AdminServiceControlRow;
  wide: boolean;
  onChange: () => void;
}) {
  const theme = useVadTheme();
  return (
    <VadCard
      variant="raised"
      style={{
        width: wide ? '48.8%' : '100%',
        gap: theme.spacing.sm,
        borderColor: service.global_paused ? theme.colors.warning : theme.colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, gap: 3 }}>
          <VadText variant="bodyStrong">{service.name}</VadText>
          <VadText variant="caption" tone="secondary">{service.description}</VadText>
        </View>
        <VadChip
          label={service.global_paused ? 'PAUSED' : 'AVAILABLE'}
          tone={service.global_paused ? 'warning' : 'yes'}
        />
      </View>

      {service.global_paused && service.global_reason ? (
        <VadText variant="caption" tone="warning">{service.global_reason}</VadText>
      ) : null}
      {service.global_resumes_at ? (
        <VadText variant="caption" tone="tertiary">
          Auto-resume {new Date(service.global_resumes_at).toLocaleString()}
        </VadText>
      ) : null}
      {service.user_scopable && service.active_user_pauses > 0 ? (
        <VadText variant="caption" tone="tertiary">
          {service.active_user_pauses} active user-specific pause{service.active_user_pauses === 1 ? '' : 's'}
        </VadText>
      ) : null}

      <VadButton
        label={service.global_paused ? 'Resume globally' : 'Pause globally'}
        variant={service.global_paused ? 'secondary' : 'danger'}
        size="small"
        onPress={onChange}
      />
    </VadCard>
  );
}
