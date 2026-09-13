import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { AdminGlobalTesterAccess } from '@/features/admin/compliance/admin-global-tester-access';
import { TesterAccessExpiry, validateTesterExpiry } from '@/features/admin/compliance/tester-access-expiry';
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
    const timer = setTimeout(() => void load(''), 0);
    return () => clearTimeout(timer);
    // Initial load only. Search is submitted explicitly to avoid querying on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 3 }}>
        <VadText variant="heading">Tester & KYC access</VadText>
        <VadText variant="caption" tone="secondary">
          Provider KYC status stays unchanged. Use the everyone bypass for broad testing or keep using individual overrides for selected accounts. Every change is audited.
        </VadText>
      </View>

      <AdminGlobalTesterAccess onChanged={() => void load()} />

      <View style={{ gap: 4 }}>
        <VadText variant="bodyStrong">Individual overrides</VadText>
        <VadText variant="caption" tone="secondary">
          When the everyone bypass is active, covered users below show GLOBAL access. You only need an individual override for an exception with a different scope or expiry.
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
        key={selected?.user_id ?? 'no-user'}
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
  const individualOverrideActive = row.override_enabled;
  const globalOverrideActive = row.global_override_enabled;
  const testerAccessActive = row.effective_sandbox_override || row.effective_production_override;
  const statusLabel = individualOverrideActive
    ? `INDIVIDUAL ${row.override_scope ?? 'SANDBOX'}`
    : globalOverrideActive
      ? `GLOBAL ${row.global_override_scope ?? 'SANDBOX'}`
      : verified
        ? 'KYC VERIFIED'
        : 'NO TESTER ACCESS';
  const statusTone: 'brand' | 'yes' | 'secondary' = testerAccessActive
    ? 'brand'
    : verified
      ? 'yes'
      : 'secondary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Manage tester access for ${row.email ?? row.display_name ?? 'user'}`}
      onPress={onPress}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: testerAccessActive
          ? theme.colors.brandPrimary
          : verified
            ? theme.colors.yes
            : theme.colors.border,
        borderRadius: theme.radius.xl,
        backgroundColor: testerAccessActive
          ? theme.colors.brandSoft
          : verified
            ? theme.colors.yesSoft
            : theme.colors.surfaceRaised,
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
        <StatusPill label={statusLabel} tone={statusTone} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <VadText variant="caption" tone={verified ? 'yes' : 'secondary'}>Provider: {row.provider_kyc_status}</VadText>
        <VadText variant="caption" tone="tertiary">Level: {row.verification_level}</VadText>
        <VadText variant="caption" tone="tertiary">{row.provider_code ?? 'No provider yet'}</VadText>
      </View>
      {individualOverrideActive ? (
        <VadText variant="caption" tone="secondary">
          Individual override · {row.override_reason ?? 'Tester access enabled'}{row.override_expires_at ? ` · expires ${new Date(row.override_expires_at).toLocaleString()}` : ' · no expiry'}
        </VadText>
      ) : globalOverrideActive ? (
        <VadText variant="caption" tone="secondary">
          Covered automatically by the everyone {row.global_override_scope === 'ALL' ? 'all-environments' : 'sandbox'} bypass. No individual override is required.
        </VadText>
      ) : null}
    </Pressable>
  );
}

function AccessEditor({ row, onClose, onSaved }: { row: AdminKycAccessRow | null; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const theme = useVadTheme();
  const [scope, setScope] = useState<'SANDBOX' | 'ALL'>(row?.override_scope ?? 'SANDBOX');
  const [reason, setReason] = useState(row?.override_reason ?? 'Tester access approved by admin');
  const [expiresAt, setExpiresAt] = useState(row?.override_expires_at ?? '');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(enabled: boolean) {
    if (!row || working) return;
    if (reason.trim().length < 3) {
      setError('Add a short reason so this override is understandable in the audit log.');
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

          {row.global_override_enabled ? (
            <View style={{ borderWidth: 1, borderColor: theme.colors.brandPrimary, backgroundColor: theme.colors.brandSoft, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 3 }}>
              <VadText variant="bodyStrong" tone="brand">Already covered by the everyone bypass</VadText>
              <VadText variant="caption" tone="secondary">
                This account already has {row.global_override_scope === 'ALL' ? 'sandbox and production' : 'sandbox'} tester access. You do not need an individual override unless this user needs a different scope or expiry.
              </VadText>
            </View>
          ) : null}

          <View style={{ borderWidth: 1, borderColor: theme.colors.warning, backgroundColor: theme.colors.warningSoft, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 3 }}>
            <VadText variant="bodyStrong" tone="warning">This does not mark Didit as verified.</VadText>
            <VadText variant="caption" tone="secondary">
              Sandbox access supports sandbox-only assets such as Test NGN. Use ALL only when you intentionally want this account to bypass supported KYC and trading gates in production too.
            </VadText>
          </View>

          <View style={{ gap: theme.spacing.sm }}>
            <VadText variant="bodyStrong">Access scope</VadText>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <ScopeChoice label="Sandbox only" detail="Test NGN and sandbox access" selected={scope === 'SANDBOX'} onPress={() => setScope('SANDBOX')} />
              <ScopeChoice label="All environments" detail="Includes production bypass" selected={scope === 'ALL'} danger onPress={() => setScope('ALL')} />
            </View>
          </View>

          <VadInput label="Reason" value={reason} onChangeText={setReason} multiline placeholder="Why is this user allowed to bypass KYC?" />
          <TesterAccessExpiry value={expiresAt} onChange={setExpiresAt} />

          {error ? <VadErrorState title="Access update blocked" message={error} /> : null}

          <VadButton
            label={row.override_enabled ? 'Update individual override' : row.global_override_enabled ? 'Add individual exception' : 'Grant individual override'}
            loading={working}
            onPress={() => void save(true)}
          />
          {row.override_enabled ? <VadButton label="Revoke individual override" variant="danger" loading={working} onPress={() => void save(false)} /> : null}
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
