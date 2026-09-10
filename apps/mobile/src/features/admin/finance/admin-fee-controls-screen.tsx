import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { OperationsSection } from '@/features/admin/operations/operations-section';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import {
  decideAdminFeePolicyProposal,
  proposeAdminFeePolicy,
  setAdminFeePolicyImmediate,
  type AdminFeeChangeRequest,
  type FeePolicyName,
} from '@/services/finance-admin-api';

type RateField = {
  key: string;
  label: string;
  hint: string;
};

type PolicyDefinition = {
  name: FeePolicyName;
  label: string;
  description: string;
  fields: RateField[];
};

const POLICY_DEFINITIONS: PolicyDefinition[] = [
  {
    name: 'trading_fee',
    label: 'Trading fees',
    description: 'Fees recognized when eligible market executions are posted.',
    fields: [
      {
        key: 'maker_rate_bps',
        label: 'Maker fee (%)',
        hint: 'Applied to eligible maker executions.',
      },
      {
        key: 'taker_rate_bps',
        label: 'Taker fee (%)',
        hint: 'Applied to eligible taker executions.',
      },
    ],
  },
  {
    name: 'settlement_fee',
    label: 'Settlement fee',
    description: 'Fee recognized from eligible settlement proceeds.',
    fields: [
      {
        key: 'rate_bps',
        label: 'Settlement fee (%)',
        hint: 'Applied to eligible settlement gross amounts.',
      },
    ],
  },
  {
    name: 'payment_fees',
    label: 'Payment fees',
    description: 'Provider-neutral fees for deposit and withdrawal flows.',
    fields: [
      {
        key: 'deposit_rate_bps',
        label: 'Deposit fee (%)',
        hint: 'Quoted on eligible deposit operations.',
      },
      {
        key: 'withdrawal_rate_bps',
        label: 'Withdrawal fee (%)',
        hint: 'Quoted on eligible withdrawal operations.',
      },
    ],
  },
];

export function AdminFeeControlsScreen() {
  const theme = useVadTheme();
  const data = useAdminData();
  const isSuperAdmin = data.access.isSuperAdmin;
  const queue = data.feePolicyQueue;

  const [selectedPolicy, setSelectedPolicy] = useState<FeePolicyName | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<AdminFeeChangeRequest | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const policyMap = useMemo(
    () => ({
      trading_fee: data.finance?.feePolicies.trading ?? {},
      settlement_fee: data.finance?.feePolicies.settlement ?? {},
      payment_fees: data.finance?.feePolicies.payments ?? {},
    }),
    [data.finance],
  );

  if (data.loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="44%" height={34} />
        <VadSkeleton height={132} />
        <VadSkeleton height={96} />
        <VadSkeleton height={160} />
      </View>
    );
  }

  if (!data.finance) {
    return (
      <VadErrorState
        title="Fee controls unavailable"
        message={
          data.error ??
          data.warning ??
          'The finance policy summary could not be loaded.'
        }
        onRetry={() => void data.refresh()}
      />
    );
  }

  function openPolicy(policyName: FeePolicyName) {
    const definition = POLICY_DEFINITIONS.find((item) => item.name === policyName);
    if (!definition) return;

    const current = policyMap[policyName];
    const nextFields: Record<string, string> = {};
    for (const field of definition.fields) {
      nextFields[field.key] = percentFromBps(current[field.key]);
    }

    setSelectedPolicy(policyName);
    setFields(nextFields);
    setReason('');
    setActionError(null);
    setMessage(null);
  }

  async function submitPolicyChange() {
    if (!selectedPolicy) return;
    const definition = POLICY_DEFINITIONS.find(
      (item) => item.name === selectedPolicy,
    );
    if (!definition) return;

    const configuration: Record<string, unknown> = {
      ...policyMap[selectedPolicy],
    };

    try {
      for (const field of definition.fields) {
        configuration[field.key] = bpsFromPercent(fields[field.key]);
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Enter valid fee percentages.',
      );
      return;
    }

    if (reason.trim().length < 3) {
      setActionError('Enter a reason for this fee change.');
      return;
    }

    setWorking(true);
    setActionError(null);
    try {
      if (isSuperAdmin) {
        const version = await setAdminFeePolicyImmediate({
          policyName: selectedPolicy,
          configuration,
          reason,
        });
        setMessage(
          `Fee policy version ${version} is active now. The Super Admin approval workflow was bypassed, but server validation and audit logging were not.`,
        );
      } else {
        const requestId = await proposeAdminFeePolicy({
          policyName: selectedPolicy,
          configuration,
          reason,
        });
        setMessage(
          `Proposal ${requestId} was submitted for Super Admin approval. It is not active yet.`,
        );
      }

      setSelectedPolicy(null);
      setReason('');
      await data.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'The fee change could not be submitted.',
      );
    } finally {
      setWorking(false);
    }
  }

  async function decideProposal(decision: 'APPROVE' | 'REJECT') {
    if (!selectedRequest || reviewReason.trim().length < 3) return;

    setWorking(true);
    setActionError(null);
    try {
      await decideAdminFeePolicyProposal({
        requestPublicId: selectedRequest.requestPublicId,
        decision,
        reason: reviewReason,
      });
      setMessage(
        decision === 'APPROVE'
          ? `${policyLabel(selectedRequest.policyName)} proposal approved and activated.`
          : `${policyLabel(selectedRequest.policyName)} proposal rejected. The active fee policy was not changed.`,
      );
      setSelectedRequest(null);
      setReviewReason('');
      await data.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'The proposal decision could not be completed.',
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <View style={{ gap: theme.spacing.xxxl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">
          MONEY · FEE CONTROLS
        </VadText>
        <VadText variant="title">
          {isSuperAdmin ? 'Set VAD fees immediately.' : 'Propose VAD fee changes.'}
        </VadText>
        <VadText tone="secondary">
          {isSuperAdmin
            ? 'Super Admin can activate a valid fee change immediately. Every direct change still creates an immutable policy version and an audit record.'
            : 'Finance operators can prepare fee changes, but they cannot activate them. A Super Admin must review and approve each proposal.'}
        </VadText>
      </View>

      <VadCard
        variant="raised"
        style={{
          gap: theme.spacing.xs,
          borderColor: isSuperAdmin
            ? theme.colors.warning
            : theme.colors.brandPrimary,
          backgroundColor: isSuperAdmin
            ? theme.colors.warningSoft
            : theme.colors.brandSoft,
        }}
      >
        <VadText variant="caption" tone={isSuperAdmin ? 'warning' : 'brand'}>
          {isSuperAdmin
            ? 'SUPER ADMIN DIRECT AUTHORITY'
            : 'DUAL-CONTROL GOVERNANCE'}
        </VadText>
        <VadText variant="bodyStrong">
          {isSuperAdmin
            ? 'Immediate means no second approval—not no controls.'
            : 'Your proposal cannot change the live fee by itself.'}
        </VadText>
        <VadText variant="caption" tone="secondary">
          {isSuperAdmin
            ? 'The server still validates fee ranges, records the reason, preserves the previous version, and audits who made the change.'
            : 'The current policy remains active until Super Admin approval. If the live policy changes before approval, the stale proposal is blocked from overwriting it.'}
        </VadText>
      </VadCard>

      {message ? (
        <VadCard
          variant="outlined"
          style={{ gap: theme.spacing.sm, borderColor: theme.colors.yes }}
        >
          <VadText variant="caption" tone="yes">
            FEE GOVERNANCE UPDATED
          </VadText>
          <VadText variant="caption" tone="secondary">
            {message}
          </VadText>
          <VadButton
            label="Dismiss"
            variant="ghost"
            size="small"
            fullWidth={false}
            onPress={() => setMessage(null)}
          />
        </VadCard>
      ) : null}

      <View style={{ gap: theme.spacing.md }}>
        <View style={{ gap: 2 }}>
          <VadText variant="heading">Current fee policy</VadText>
          <VadText variant="caption" tone="secondary">
            Percentages below are live policy configuration, not revenue already
            earned.
          </VadText>
        </View>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.md,
          }}
        >
          {POLICY_DEFINITIONS.map((definition) => (
            <PolicyCard
              key={definition.name}
              definition={definition}
              configuration={policyMap[definition.name]}
              actionLabel={isSuperAdmin ? 'Edit & apply' : 'Propose change'}
              onPress={() => openPolicy(definition.name)}
            />
          ))}
        </View>
      </View>

      <OperationsSection
        title={isSuperAdmin ? 'Pending fee proposals' : 'My pending fee proposals'}
        description={
          isSuperAdmin
            ? 'Review finance-team proposals. Approval creates a new immutable active policy version.'
            : 'These proposals are waiting for Super Admin review and are not active.'
        }
        count={queue.length}
      >
        {queue.length ? (
          queue.map((request) => (
            <ProposalRow
              key={request.requestPublicId}
              request={request}
              canReview={isSuperAdmin}
              onPress={() => {
                if (!isSuperAdmin) return;
                setSelectedRequest(request);
                setReviewReason('');
                setActionError(null);
                setMessage(null);
              }}
            />
          ))
        ) : (
          <View style={{ paddingVertical: theme.spacing.lg, gap: 2 }}>
            <VadText variant="bodyStrong">No fee proposals are waiting.</VadText>
            <VadText variant="caption" tone="secondary">
              {isSuperAdmin
                ? 'New finance-team proposals will appear here for review.'
                : 'Use a policy card above when you need to request a fee change.'}
            </VadText>
          </View>
        )}
      </OperationsSection>

      <VadBottomSheet
        visible={Boolean(selectedPolicy)}
        title={isSuperAdmin ? 'Apply fee change immediately' : 'Propose fee change'}
        onClose={() => {
          if (!working) setSelectedPolicy(null);
        }}
      >
        {selectedPolicy ? (
          <View style={{ gap: theme.spacing.lg }}>
            <View style={{ gap: 2 }}>
              <VadText variant="label" tone="brand">
                {policyLabel(selectedPolicy).toUpperCase()}
              </VadText>
              <VadText variant="heading">
                {isSuperAdmin
                  ? 'Direct Super Admin activation'
                  : 'Super Admin approval required'}
              </VadText>
            </View>

            {POLICY_DEFINITIONS.find(
              (item) => item.name === selectedPolicy,
            )?.fields.map((field) => (
              <VadInput
                key={field.key}
                label={field.label}
                value={fields[field.key] ?? '0'}
                onChangeText={(value) => {
                  setFields((current) => ({ ...current, [field.key]: value }));
                  setActionError(null);
                }}
                keyboardType="decimal-pad"
                hint={field.hint}
              />
            ))}

            <VadInput
              label="Reason"
              value={reason}
              onChangeText={(value) => {
                setReason(value);
                setActionError(null);
              }}
              placeholder={
                isSuperAdmin
                  ? 'Why should this fee change take effect now?'
                  : 'Why should Super Admin approve this fee change?'
              }
              multiline
            />

            <VadText variant="caption" tone="tertiary">
              Existing fixed minimum/maximum policy values are preserved by this
              rate editor. Fee percentages must remain between 0% and 100%.
            </VadText>

            {actionError ? (
              <VadErrorState title="Fee change blocked" message={actionError} />
            ) : null}

            <VadButton
              label={
                isSuperAdmin
                  ? 'Apply immediately'
                  : 'Submit for Super Admin approval'
              }
              variant={isSuperAdmin ? 'primary' : 'secondary'}
              loading={working}
              disabled={reason.trim().length < 3}
              onPress={() => void submitPolicyChange()}
            />
          </View>
        ) : null}
      </VadBottomSheet>

      <VadBottomSheet
        visible={Boolean(selectedRequest)}
        title="Review fee proposal"
        onClose={() => {
          if (!working) setSelectedRequest(null);
        }}
      >
        {selectedRequest ? (
          <View style={{ gap: theme.spacing.lg }}>
            <View style={{ gap: theme.spacing.xs }}>
              <VadText variant="label" tone="brand">
                {policyLabel(selectedRequest.policyName).toUpperCase()}
              </VadText>
              <VadText variant="heading">
                {proposalConfigurationSummary(selectedRequest)}
              </VadText>
              <VadText variant="caption" tone="secondary">
                Proposed by{' '}
                {selectedRequest.proposerEmail ?? selectedRequest.proposedBy} ·{' '}
                {formatDate(selectedRequest.proposedAt)}
              </VadText>
              <VadText variant="caption" tone="secondary">
                Proposal reason: {selectedRequest.proposalReason}
              </VadText>
            </View>

            <VadCard variant="outlined" style={{ gap: 2 }}>
              <VadText variant="caption" tone="warning">
                SERVER REVIEW PROTECTIONS
              </VadText>
              <VadText variant="caption" tone="secondary">
                Approval is rejected if this proposal is stale or if the reviewer
                is also the proposer. A Super Admin can reject an obsolete own
                proposal and use the explicit immediate-update path instead.
              </VadText>
            </VadCard>

            <VadInput
              label="Review reason"
              value={reviewReason}
              onChangeText={(value) => {
                setReviewReason(value);
                setActionError(null);
              }}
              placeholder="Record why you approve or reject this proposal."
              multiline
            />

            {actionError ? (
              <VadErrorState
                title="Proposal decision blocked"
                message={actionError}
              />
            ) : null}

            <VadButton
              label="Approve & activate"
              loading={working}
              disabled={reviewReason.trim().length < 3}
              onPress={() => void decideProposal('APPROVE')}
            />
            <VadButton
              label="Reject proposal"
              variant="danger"
              loading={working}
              disabled={reviewReason.trim().length < 3}
              onPress={() => void decideProposal('REJECT')}
            />
          </View>
        ) : null}
      </VadBottomSheet>
    </View>
  );
}

function PolicyCard({
  definition,
  configuration,
  actionLabel,
  onPress,
}: {
  definition: PolicyDefinition;
  configuration: Record<string, unknown>;
  actionLabel: string;
  onPress: () => void;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${actionLabel} ${definition.label}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexGrow: 1,
        flexBasis: 250,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <VadCard
        variant="raised"
        style={{ minHeight: 156, gap: theme.spacing.md }}
      >
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="heading">{definition.label}</VadText>
          <VadText variant="caption" tone="secondary">
            {definition.description}
          </VadText>
        </View>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.lg,
          }}
        >
          {definition.fields.map((field) => (
            <View key={field.key} style={{ minWidth: 90 }}>
              <VadText variant="bodyStrong">
                {formatPercent(configuration[field.key])}
              </VadText>
              <VadText variant="caption" tone="tertiary">
                {field.label.replace(' (%)', '')}
              </VadText>
            </View>
          ))}
        </View>
        <VadText variant="caption" tone="brand">
          {actionLabel} →
        </VadText>
      </VadCard>
    </Pressable>
  );
}

function ProposalRow({
  request,
  canReview,
  onPress,
}: {
  request: AdminFeeChangeRequest;
  canReview: boolean;
  onPress: () => void;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole={canReview ? 'button' : undefined}
      onPress={canReview ? onPress : undefined}
      style={({ pressed }) => ({
        minHeight: 76,
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
        <VadText variant="bodyStrong">{policyLabel(request.policyName)}</VadText>
        <VadText variant="caption" tone="secondary" numberOfLines={2}>
          {proposalConfigurationSummary(request)} · {request.proposalReason}
        </VadText>
        <VadText variant="caption" tone="tertiary">
          {request.proposerEmail ? `${request.proposerEmail} · ` : ''}
          {formatDate(request.proposedAt)}
        </VadText>
      </View>
      <VadText variant="caption" tone="warning">
        PENDING
      </VadText>
      {canReview ? (
        <VadText variant="heading" tone="tertiary">
          ›
        </VadText>
      ) : null}
    </Pressable>
  );
}

function policyLabel(name: FeePolicyName) {
  return (
    POLICY_DEFINITIONS.find((item) => item.name === name)?.label ??
    name.replaceAll('_', ' ')
  );
}

function formatPercent(value: unknown) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return '0%';
  return `${(numeric / 100).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  })}%`;
}

function percentFromBps(value: unknown) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return '0';
  return String(numeric / 100);
}

function bpsFromPercent(value: string) {
  const numeric = Number(value.trim());
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    throw new Error(
      'Fee percentages must be valid numbers between 0% and 100%.',
    );
  }
  return Math.round(numeric * 1000000) / 10000;
}

function proposalConfigurationSummary(request: AdminFeeChangeRequest) {
  const cfg = request.configuration;
  if (request.policyName === 'trading_fee') {
    return `Maker ${formatPercent(cfg.maker_rate_bps)} · Taker ${formatPercent(cfg.taker_rate_bps)}`;
  }
  if (request.policyName === 'settlement_fee') {
    return `Settlement ${formatPercent(cfg.rate_bps)}`;
  }
  return `Deposit ${formatPercent(cfg.deposit_rate_bps)} · Withdrawal ${formatPercent(cfg.withdrawal_rate_bps)}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Pending review'
    : date.toLocaleString();
}
