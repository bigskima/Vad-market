import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadDateTimeField } from '@/components/ui/vad-date-time-field';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getAdminKycAccess,
  setAdminKycAccess,
  type AdminKycAccessRow,
} from '@/services/admin-kyc-access-api';

export function AdminKycAccessPanel() {
  const theme = useVadTheme();
  const [rows, setRows] = useState<AdminKycAccessRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminKycAccessRow | null>(null);

  async function load(query = search) {
    setLoading(true);
    setError(null);
    try {
      setRows(await getAdminKycAccess(query));
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Tester access could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load('');
    // Initial load only. Search is submitted explicitly to avoid querying on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 3 }}>
        <VadText variant="heading">Tester & KYC access</VadText>
        <VadText variant="caption" tone="secondary">
          Provider KYC status stays unchanged. A VAD access override only lets a selected tester pass product access checks; every grant and revoke is audited.
        </VadText>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <VadInput
            label="Find user"
            value={search}
            onChangeText={setSearch}
            placeholder="Email, name or username"
            autoCapitalize="none"
          />
        </View>
        <VadButton label="Search" variant="secondary" onPress={() => void load()} />
      </View>

      {error ? <VadErrorState title="Tester access unavailable" message={error} onRetry={() => void load()} /> : null}

      {loading ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadSkeleton height={92} />
          <VadSkeleton height={92} />
        </View>
      ) : rows.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          {rows.map((row) => (
            <AccessRow key={row.user_id} row={row} onPress={() => setSelected(row)} />
          ))}
        </View>
      ) : (
        <View style={{ paddingVertical: theme.spacing.lg, gap: 2 }}>
          <VadText variant="bodyStrong">No matching user.</VadText>
          <VadText variant="caption" tone="secondary">Search by email, name or username.</VadText>
        </View>
      )}

      <AccessEditor
        row={selected}
        onClose={() => setSelected(null)}
        onSaved={async () => {
          setSelected(null);
          await load();
        }}
      />
    </View>
  );
}

function AccessRow({ row, onPress }: { row: AdminKycAccessRow; onPress: () => void }) {
  const theme = useVadTheme();
  const verified = row.provider_kyc_status === 'VERIFIED' || row.provider_kyc_status === 'APPROVED';
  const overrideActive = row.override_enabled && (!row.override_expires_at || Date.parse(row.override_expires_at) > Date.now());

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Manage tester access for ${row.email ?? row.display_name ?? 'user'}`}
      onPress={onPress}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: overrideActive ? theme.colors.brandPrimary : theme.colors.border,
        borderRadius: theme.radius.xl,
        backgroundColor: overrideActive ? theme.colors.brandSoft : theme.colors.surfaceRaised,
        padding: theme.spacing.md,
        gap: 8,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="bodyStrong" numberOfLines={1}>{row.display_name || row.email || 'VAD user'}</VadText>
          <VadText variant="caption" tone="secondary" numberOfLines={1}>{row.email ?? row.user_id}</VadText>
        </View>
        <StatusPill label={overrideActive ? `${row.override_scope} ACCESS` : verified ? 'KYC VERIFIED' : 'NO OVERRIDE'} tone={overrideActive ? 'brand' : verified ? 'yes' : 'secondary'} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <VadText variant="caption" tone={verified ? 'yes' : 'secondary'}>Provider: {row.provider_kyc_status}</VadText>
        <VadText variant="caption" tone="tertiary">Level: {row.verification_level}</VadText>
        <VadText variant="caption" tone="tertiary">{row.provider_code ?? 'No provider yet'}</VadText>
      </View>
      {overrideActive ? (
        <VadText variant="caption" tone="secondary">
          {row.override_reason ?? 'Tester access enabled'}{row.override_expires_at ? ` · expires ${new Date(row.override_expires_at).toLocaleString()}` : ' · no expiry'}
        </VadText>
      ) : null}
    </Pressable>
  );
}

function AccessEditor({ row, onClose, onSaved }: { row: AdminKycAccessRow | null; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const theme = useVadTheme();
  const [scope, setScope] = useState<'SANDBOX' | 'ALL'>('SANDBOX');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setScope(row.override_scope ?? 'SANDBOX');
    setReason(row.override_reason ?? 'Tester access approved by admin');
    setExpiresAt(row.override_expires_at ?? '');
    setError(null);
  }, [row]);

  async function save(enabled: boolean) {
    if (!row || working) return;
    if (reason.trim().length < 3) {
      setError('Add a short reason so this override is understandable in the audit log.');
      return;
    }
    setWorking(true);
    setError(null);
    try {
      await setAdminKycAccess({
        userId: row.user_id,
        scope,
        enabled,
        reason,
        expiresAt: enabled ? expiresAt || null : null,
      });
      await onSaved();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Tester access could not be updated.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <VadBottomSheet visible={Boolean(row)} title="Manage tester access" onClose={onClose}>
      {row ? (
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: 2 }}>
            <VadText variant="heading">{row.display_name || row.email || 'VAD user'}</VadText>
            <VadText variant="caption" tone="secondary">Actual KYC: {row.provider_kyc_status} · {row.verification_level}</VadText>
          </View>

          <View style={{ borderWidth: 1, borderColor: theme.colors.warning, backgroundColor: theme.colors.warningSoft, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 3 }}>
            <VadText variant="bodyStrong" tone="warning">This does not mark Didit as verified.</VadText>
            <VadText variant="caption" tone="secondary">It grants a separate VAD access exception. Use ALL only when you intentionally want this account to bypass KYC-gated access in production.</VadText>
          </View>

          <View style={{ gap: theme.spacing.sm }}>
            <VadText variant="bodyStrong">Access scope</VadText>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <ScopeChoice label="Sandbox only" detail="Only works with sandbox providers" selected={scope === 'SANDBOX'} onPress={() => setScope('SANDBOX')} />
              <ScopeChoice label="All environments" detail="Can bypass KYC in production" selected={scope === 'ALL'} danger onPress={() => setScope('ALL')} />
            </View>
          </View>

          <VadInput label="Reason" value={reason} onChangeText={setReason} multiline placeholder="Why is this user allowed to bypass KYC?" />
          <VadDateTimeField label="Override expiry" value={expiresAt} onChange={setExpiresAt} clearable hint="Optional. Leave empty for no automatic expiry." />

          {error ? <VadErrorState title="Access update blocked" message={error} /> : null}

          <VadButton label={row.override_enabled ? 'Update access override' : 'Grant access override'} loading={working} onPress={() => void save(true)} />
          {row.override_enabled ? <VadButton label="Revoke override" variant="danger" loading={working} onPress={() => void save(false)} /> : null}
        </View>
      ) : null}
    </VadBottomSheet>
  );
}

function ScopeChoice({ label, detail, selected, danger = false, onPress }: { label: string; detail: string; selected: boolean; danger?: boolean; onPress: () => void }) {
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
        gap: 2,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <VadText variant="bodyStrong" tone={selected ? danger ? 'danger' : 'brand' : 'primary'}>{label}</VadText>
      <VadText variant="caption" tone="secondary">{detail}</VadText>
    </Pressable>
  );
}

function StatusPill({ label, tone }: { label: string; tone: 'brand' | 'yes' | 'secondary' }) {
  const theme = useVadTheme();
  return (
    <View style={{ borderRadius: theme.radius.pill, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: tone === 'brand' ? theme.colors.brandSoft : tone === 'yes' ? theme.colors.yesSoft : theme.colors.surfaceMuted }}>
      <VadText variant="caption" tone={tone}>{label}</VadText>
    </View>
  );
}
