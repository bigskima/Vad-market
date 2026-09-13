import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { TesterAccessExpiry, validateTesterExpiry } from '@/features/admin/compliance/tester-access-expiry';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getAdminGlobalKycAccess,
  setAdminGlobalKycAccess,
  type AdminGlobalKycAccess,
} from '@/services/admin-kyc-access-api';

export function AdminGlobalTesterAccess() {
  const theme = useVadTheme();
  const [access, setAccess] = useState<AdminGlobalKycAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setAccess(await getAdminGlobalKycAccess());
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Everyone tester access could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, []);

  if (loading && !access) return <VadSkeleton height={154} />;

  if (error && !access) {
    return <VadErrorState title="Everyone bypass unavailable" message={error} onRetry={() => void load()} />;
  }

  if (!access) return null;

  const status = !access.enabled
    ? 'OFF'
    : access.scope === 'ALL'
      ? 'ALL ENVIRONMENTS'
      : 'SANDBOX FOR EVERYONE';

  return (
    <>
      <View
        style={{
          borderWidth: 1,
          borderColor: access.enabled
            ? access.scope === 'ALL' ? theme.colors.warning : theme.colors.brandPrimary
            : theme.colors.border,
          borderRadius: theme.radius.xl,
          backgroundColor: access.enabled
            ? access.scope === 'ALL' ? theme.colors.warningSoft : theme.colors.brandSoft
            : theme.colors.surfaceRaised,
          padding: theme.spacing.md,
          gap: theme.spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <View style={{ flex: 1, gap: 3 }}>
            <VadText variant="bodyStrong">Everyone tester bypass</VadText>
            <VadText variant="caption" tone="secondary">
              One switch for every account. Individual overrides below remain available for exceptions.
            </VadText>
          </View>
          <View style={{ borderRadius: theme.radius.pill, backgroundColor: theme.colors.surface, paddingHorizontal: 10, paddingVertical: 6 }}>
            <VadText variant="caption" tone={access.enabled ? access.scope === 'ALL' ? 'warning' : 'brand' : 'secondary'}>{status}</VadText>
          </View>
        </View>

        <VadText variant="caption" tone="secondary">
          {access.enabled
            ? access.scope === 'ALL'
              ? 'Production and sandbox KYC/trading gates can be bypassed for testing. Use this only intentionally.'
              : 'All users can use sandbox-only assets such as Test NGN without completing provider KYC. Production remains gated.'
            : 'No global bypass is active. Only individually approved testers can bypass eligible checks.'}
        </VadText>

        {access.enabled ? (
          <VadText variant="caption" tone="tertiary">
            {access.reason ?? 'Tester bypass enabled'}{access.expiresAt ? ` · expires ${new Date(access.expiresAt).toLocaleString()}` : ' · no expiry'}
          </VadText>
        ) : null}

        {error ? <VadText variant="caption" tone="danger">{error}</VadText> : null}
        <VadButton label="Manage everyone access" variant="secondary" onPress={() => setEditing(true)} />
      </View>

      <GlobalAccessEditor
        key={`${access.updatedAt ?? 'global'}-${editing ? 'open' : 'closed'}`}
        visible={editing}
        access={access}
        onClose={() => setEditing(false)}
        onSaved={async (next) => {
          setAccess(next);
          setEditing(false);
        }}
      />
    </>
  );
}

function GlobalAccessEditor({
  visible,
  access,
  onClose,
  onSaved,
}: {
  visible: boolean;
  access: AdminGlobalKycAccess;
  onClose: () => void;
  onSaved: (access: AdminGlobalKycAccess) => Promise<void> | void;
}) {
  const theme = useVadTheme();
  const [scope, setScope] = useState<'SANDBOX' | 'ALL'>(access.scope);
  const [reason, setReason] = useState(access.reason ?? 'Global tester access approved by admin');
  const [expiresAt, setExpiresAt] = useState(access.expiresAt ?? '');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(enabled: boolean) {
    if (working) return;
    if (reason.trim().length < 3) {
      setError('Add a short reason so this global setting is clear in the audit log.');
      return;
    }
    const expiryError = enabled ? validateTesterExpiry(expiresAt) : null;
    if (expiryError) {
      setError(expiryError);
      return;
    }

    setWorking(true);
    setError(null);
    try {
      const next = await setAdminGlobalKycAccess({
        scope,
        enabled,
        reason,
        expiresAt: enabled ? expiresAt || null : null,
      });
      await onSaved(next);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Everyone tester access could not be updated.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <VadBottomSheet visible={visible} title="Everyone tester bypass" onClose={onClose}>
      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ gap: 3 }}>
          <VadText variant="heading">Apply one override to everybody</VadText>
          <VadText variant="caption" tone="secondary">
            This does not change Didit/provider verification records. It changes VAD access checks for testing and is audited.
          </VadText>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <VadText variant="bodyStrong">Access scope</VadText>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <GlobalScopeChoice
              label="Sandbox only"
              detail="TNGN and sandbox-gated testing for everyone. Production stays protected."
              selected={scope === 'SANDBOX'}
              onPress={() => setScope('SANDBOX')}
            />
            <GlobalScopeChoice
              label="All environments"
              detail="Also bypasses production KYC/trade gates for everyone."
              selected={scope === 'ALL'}
              danger
              onPress={() => setScope('ALL')}
            />
          </View>
        </View>

        {scope === 'ALL' ? (
          <View style={{ borderWidth: 1, borderColor: theme.colors.warning, backgroundColor: theme.colors.warningSoft, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 3 }}>
            <VadText variant="bodyStrong" tone="warning">Production-wide bypass</VadText>
            <VadText variant="caption" tone="secondary">
              Every account can pass supported production KYC and trading eligibility gates while this is enabled. Sandbox only is safer for routine testing.
            </VadText>
          </View>
        ) : null}

        <VadInput label="Reason" value={reason} onChangeText={setReason} multiline placeholder="Why should everyone receive tester access?" />
        <TesterAccessExpiry value={expiresAt} onChange={setExpiresAt} />

        {error ? <VadErrorState title="Global access update blocked" message={error} /> : null}

        <VadButton label={access.enabled ? 'Update everyone bypass' : 'Enable for everyone'} loading={working} onPress={() => void save(true)} />
        {access.enabled ? <VadButton label="Turn off everyone bypass" variant="danger" loading={working} onPress={() => void save(false)} /> : null}
      </View>
    </VadBottomSheet>
  );
}

function GlobalScopeChoice({
  label,
  detail,
  selected,
  danger = false,
  onPress,
}: {
  label: string;
  detail: string;
  selected: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 180,
        borderWidth: 1,
        borderColor: selected ? danger ? theme.colors.danger : theme.colors.brandPrimary : theme.colors.border,
        backgroundColor: selected ? danger ? theme.colors.noSoft : theme.colors.brandSoft : theme.colors.surface,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.md,
        gap: 3,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <VadText variant="bodyStrong" tone={selected ? danger ? 'danger' : 'brand' : 'primary'}>{label}</VadText>
      <VadText variant="caption" tone="secondary">{detail}</VadText>
    </Pressable>
  );
}
