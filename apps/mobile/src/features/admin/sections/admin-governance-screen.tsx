import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { AdminSectionTabs } from '@/features/admin/components/admin-section-tabs';
import { AdminMetricCard } from '@/features/admin/dashboard/admin-metric-card';
import { AdminMarketProposalReview } from '@/features/admin/governance/admin-market-proposal-review';
import {
  OperationsRow,
  OperationsSection,
} from '@/features/admin/operations/operations-section';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import {
  createAdminProvisionalResolution,
  finalizeAdminResolution,
  getAdminOracleOutcomeChoices,
  type AdminOracleOutcomeChoice,
  finalizeAdminVoid,
  hasAdminPermission,
} from '@/services/admin-control-api';
import {
  approveOraclePolicy,
  getOraclePolicyCatalog,
  type OraclePolicyRow,
} from '@/services/provider-admin-api';

type OracleRow = Record<string, unknown>;
type ProposalRow = Record<string, unknown>;
type ResolutionAction = 'CREATE' | 'FINALIZE' | 'VOID';

export function AdminGovernanceScreen() {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const data = useAdminData();
  const canManageMarkets = hasAdminPermission(data.access, 'markets.manage');
  const canReviewOracle = hasAdminPermission(data.access, 'oracle.review');
  const [tab, setTab] = useState(
    canManageMarkets ? 'markets' : 'oracle',
  );
  const [selectedProposal, setSelectedProposal] = useState<ProposalRow | null>(null);
  const [selectedOracle, setSelectedOracle] = useState<OracleRow | null>(null);
  const [action, setAction] = useState<ResolutionAction | null>(null);
  const [outcomeCode, setOutcomeCode] = useState('');
  const [outcomeChoices, setOutcomeChoices] = useState<AdminOracleOutcomeChoice[]>([]);
  const [outcomeChoicesLoading, setOutcomeChoicesLoading] = useState(false);
  const [outcomeChoicesError, setOutcomeChoicesError] = useState<string | null>(null);
  const [evidenceNote, setEvidenceNote] = useState('');
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [policies, setPolicies] = useState<OraclePolicyRow[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(canReviewOracle);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policyWorkingId, setPolicyWorkingId] = useState<string | null>(null);

  const loadPolicies = useCallback(async () => {
    if (!canReviewOracle) return;
    setPolicyError(null);
    try {
      setPolicies(await getOraclePolicyCatalog());
    } catch (value) {
      setPolicyError('Result policies could not be loaded.');
    } finally {
      setPoliciesLoading(false);
    }
  }, [canReviewOracle]);

  useEffect(() => {
    const timer = setTimeout(() => void loadPolicies(), 0);
    return () => clearTimeout(timer);
  }, [loadPolicies]);

  const tabs = useMemo(() => {
    const next: { key: string; label: string; count: number }[] = [];
    if (canManageMarkets) {
      next.push({
        key: 'markets',
        label: 'Market review',
        count: data.marketQueue.length,
      });
    }
    if (canReviewOracle) {
      next.push({
        key: 'oracle',
        label: 'Results',
        count: data.oracleQueue.length,
      });
      next.push({
        key: 'policies',
        label: 'Result policies',
        count: policies.filter((policy) => policy.status === 'DRAFT').length,
      });
    }
    return next;
  }, [canManageMarkets, canReviewOracle, data.marketQueue.length, data.oracleQueue.length, policies]);

  if (data.loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="55%" height={32} />
        <VadSkeleton height={44} />
        <VadSkeleton height={72} />
        <VadSkeleton height={72} />
      </View>
    );
  }

  if (data.error) {
    return (
      <VadErrorState
        title="Governance unavailable"
        message={data.error}
        onRetry={() => void data.load()}
      />
    );
  }

  const total = data.marketQueue.length + data.oracleQueue.length;

  async function openOracle(row: OracleRow) {
    if (!canReviewOracle) return;
    const resolutionId = Number(row.resolution_id ?? 0);
    const eventPublicId = String(row.event_public_id ?? '');
    setSelectedOracle(row);
    setAction(resolutionId > 0 ? null : 'CREATE');
    setOutcomeCode(String(row.outcome_code ?? ''));
    setEvidenceNote('');
    setActionError(null);
    setOutcomeChoices([]);
    setOutcomeChoicesError(null);
    setOutcomeChoicesLoading(resolutionId === 0 && Boolean(eventPublicId));

    if (resolutionId > 0 || !eventPublicId) return;
    try {
      const choices = await getAdminOracleOutcomeChoices(eventPublicId);
      setOutcomeChoices(choices);
      setOutcomeCode((current) =>
        choices.some((choice) => choice.outcome_code === current)
          ? current
          : choices[0]?.outcome_code ?? '',
      );
      if (!choices.length) setOutcomeChoicesError('No result options are available for this market.');
    } catch (reason: unknown) {
      setOutcomeChoicesError('Could not load result options. Refresh and try again.');
    } finally {
      setOutcomeChoicesLoading(false);
    }
  }

  async function submitResolutionAction() {
    if (!selectedOracle || !action || evidenceNote.trim().length < 3) return;

    const eventPublicId = String(selectedOracle.event_public_id ?? '');
    const resolutionId = Number(selectedOracle.resolution_id ?? 0);

    setWorking(true);
    setActionError(null);
    setActionMessage(null);

    try {
      if (action === 'CREATE') {
        if (!eventPublicId || !outcomeCode.trim()) {
          throw new Error('Choose a result option.');
        }
        if (!outcomeChoices.some((choice) => choice.outcome_code === outcomeCode)) {
          throw new Error('That result option is no longer available. Refresh the queue and try again.');
        }
        await createAdminProvisionalResolution({
          eventPublicId,
          outcomeCode: outcomeCode.trim(),
          evidence: { operatorNote: evidenceNote.trim() },
        });
        setActionMessage(
          `Result submitted for review. A different reviewer must confirm it after the dispute period.`,
        );
      } else if (action === 'FINALIZE') {
        if (!resolutionId) throw new Error('Resolution reference is unavailable.');
        await finalizeAdminResolution(resolutionId, {
          operatorNote: evidenceNote.trim(),
        });
        setActionMessage('Result confirmed. Payouts are handled separately by Finance.');
      } else {
        if (!resolutionId) throw new Error('Resolution reference is unavailable.');
        await finalizeAdminVoid(resolutionId, {
          operatorNote: evidenceNote.trim(),
        });
        setActionMessage('Market marked void under the current rules.');
      }

      setSelectedOracle(null);
      setAction(null);
      setEvidenceNote('');
      setOutcomeCode('');
      await data.refresh();
    } catch (reasonValue) {
      setActionError(
        reasonValue instanceof Error
          ? reasonValue.message
          : 'Oracle action could not be completed.',
      );
    } finally {
      setWorking(false);
    }
  }

  async function approvePolicy(policy: OraclePolicyRow) {
    setPolicyWorkingId(policy.public_id);
    setPolicyError(null);
    setActionMessage(null);
    try {
      await approveOraclePolicy(policy.public_id);
      setActionMessage(`${policy.name} version ${policy.version} is now active.`);
      await Promise.all([loadPolicies(), data.refresh()]);
    } catch (value) {
      setPolicyError('Could not update result policies. Try again.');
    } finally {
      setPolicyWorkingId(null);
    }
  }

  const activeDisputes = Number(selectedOracle?.active_disputes ?? 0);
  const selectedResolutionId = Number(selectedOracle?.resolution_id ?? 0);

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.xl,
          alignItems: wide ? 'flex-end' : 'stretch',
        }}
      >
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="label" tone="brand">GOVERNANCE</VadText>
          <VadText variant="title">Markets & resolution.</VadText>
          <VadText tone="secondary">
            Review markets and manage how results are verified. A second reviewer, dispute periods and payouts remain separate steps.
          </VadText>
        </View>

        <View
          style={{
            minWidth: wide ? 300 : undefined,
            flexDirection: 'row',
            gap: theme.spacing.sm,
          }}
        >
          {canManageMarkets ? (
            <AdminMetricCard
              label="Market review"
              value={data.marketQueue.length}
              tone={data.marketQueue.length ? 'warning' : 'yes'}
            />
          ) : null}
          {canReviewOracle ? (
            <AdminMetricCard
              label="Results to review"
              value={data.oracleQueue.length}
              tone={data.oracleQueue.length ? 'warning' : 'yes'}
            />
          ) : null}
        </View>
      </View>

      {actionMessage ? (
        <View
          style={{
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.yes,
            backgroundColor: theme.colors.yesSoft,
            padding: theme.spacing.md,
            gap: theme.spacing.xs,
          }}
        >
          <VadText variant="caption" tone="yes">UPDATE SAVED</VadText>
          <VadText variant="caption" tone="secondary">{actionMessage}</VadText>
          <VadButton
            label="Dismiss"
            variant="ghost"
            size="small"
            fullWidth={false}
            onPress={() => setActionMessage(null)}
          />
        </View>
      ) : null}

      {tabs.length > 1 ? (
        <AdminSectionTabs
          active={tab}
          onChange={setTab}
          items={tabs}
        />
      ) : null}

      {tab === 'markets' && canManageMarkets ? (
        <OperationsSection
          title="Market review"
          description={
            total
              ? 'Open a proposal to approve its market settings, request clarification, or reject it.'
              : 'No governance work is waiting.'
          }
          count={data.marketQueue.length}
        >
          {data.marketQueue.length ? (
            data.marketQueue.map((row, index) => (
              <OperationsRow
                key={String(row.proposal_public_id ?? 'market-' + index)}
                title={String(
                  row.question ?? row.title ?? 'Market proposal',
                )}
                detail={
                  String(row.category ?? 'General') +
                  ' · ' +
                  String(row.proposal_status ?? row.status ?? 'Awaiting review')
                }
                meta={
                  row.created_at
                    ? `Submitted ${new Date(String(row.created_at)).toLocaleString()}`
                    : undefined
                }
                status={String(row.proposal_status ?? row.status ?? 'PENDING')}
                actionLabel="Review"
                onPress={() => setSelectedProposal(row)}
              />
            ))
          ) : (
            <EmptyText>No market proposals need review.</EmptyText>
          )}
        </OperationsSection>
      ) : tab === 'oracle' && canReviewOracle ? (
        <OperationsSection
          title="Result review queue"
          description="Review proposed results. A second reviewer can confirm them after the dispute period."
          count={data.oracleQueue.length}
        >
          {data.oracleQueue.length ? (
            data.oracleQueue.map((row, index) => {
              const resolutionId = Number(row.resolution_id ?? 0);
              const disputes = Number(row.active_disputes ?? 0);
              return (
                <OperationsRow
                  key={'oracle-' + index}
                  title={String(row.event_title ?? 'Market result')}
                  detail={
                    resolutionId
                      ? `Submitted result: ${String(row.outcome_code ?? 'outcome')} · ${disputes} active dispute${disputes === 1 ? '' : 's'}`
                      : 'Awaiting provisional outcome'
                  }
                  meta={
                    row.provisional_at
                      ? `Submitted for review ${new Date(String(row.provisional_at)).toLocaleString()}`
                      : `Event: ${String(row.event_status ?? 'AWAITING RESULT').replaceAll('_', ' ').toLowerCase()}`
                  }
                  status={String(
                    row.resolution_status ?? row.event_status ?? 'OPEN',
                  )}
                  actionLabel={resolutionId ? 'Resolve' : 'Review'}
                  onPress={() => openOracle(row)}
                />
              );
            })
          ) : (
            <EmptyText>No results need review.</EmptyText>
          )}
        </OperationsSection>
      ) : tab === 'policies' && canReviewOracle ? (
        <OperationsSection
          title="Result policies"
          description="Choose trusted sources, the agreement needed, dispute periods and when to void a result. Another reviewer must approve changes."
          count={policies.length}
        >
          {policiesLoading ? (
            <View style={{ gap: theme.spacing.sm }}>
              <VadSkeleton height={72} />
              <VadSkeleton height={72} />
            </View>
          ) : policyError ? (
            <VadErrorState title="Result verification policies unavailable" message={policyError} onRetry={() => void loadPolicies()} />
          ) : policies.length ? (
            policies.map((policy) => {
              const providerCodes = policy.source_hierarchy
                .map((entry) => typeof entry === 'string' ? entry : String(entry.provider_code ?? entry.providerCode ?? ''))
                .filter(Boolean)
                .join(' + ');
              const quorum = Number(policy.consensus_rule.min_agreeing_providers ?? policy.consensus_rule.quorum ?? 0);
              return (
                <OperationsRow
                  key={policy.public_id}
                  title={`${policy.name} · v${policy.version}`}
                  detail={`Sources: ${providerCodes || 'not set'} · Agreement needed: ${quorum || '—'} · Dispute: ${Math.round(policy.dispute_window_seconds / 60)} min`}
                  meta={policy.status === 'DRAFT' ? 'Prepared for independent approval' : `Effective ${new Date(policy.effective_at).toLocaleString()}`}
                  status={policy.status}
                  ready={policy.status === 'ACTIVE'}
                  actionLabel={policy.status === 'DRAFT' ? 'Approve' : undefined}
                  onPress={policy.status === 'DRAFT' && policyWorkingId !== policy.public_id ? () => void approvePolicy(policy) : undefined}
                />
              );
            })
          ) : (
            <EmptyText>No result-verification policies are configured.</EmptyText>
          )}
        </OperationsSection>
      ) : (
        <EmptyText>No governance workspace is assigned to this role.</EmptyText>
      )}

      <AdminMarketProposalReview
        proposal={selectedProposal}
        onClose={() => setSelectedProposal(null)}
        onCompleted={async (message) => {
          setActionMessage(message);
          await data.refresh();
        }}
      />

      <VadBottomSheet
        visible={Boolean(selectedOracle)}
        title={selectedResolutionId ? 'Review result' : 'Submit result for review'}
        onClose={() => {
          if (!working) setSelectedOracle(null);
        }}
      >
        {selectedOracle ? (
          <View style={{ gap: theme.spacing.lg }}>
            <View style={{ gap: 2 }}>
              <VadText variant="label" tone="brand">RESULT REVIEW</VadText>
              <VadText variant="heading">
                {String(selectedOracle.event_title ?? 'Market event')}
              </VadText>
              <VadText variant="caption" tone="secondary" selectable>
                {String(selectedOracle.event_public_id ?? '')}
              </VadText>
            </View>

            {selectedResolutionId ? (
              <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <ActionChoice
                  label="Finalize outcome"
                  detail={`Confirm the current ${String(selectedOracle.outcome_code ?? '')} result.`}
                  selected={action === 'FINALIZE'}
                  disabled={activeDisputes > 0}
                  onPress={() => setAction('FINALIZE')}
                />
                <ActionChoice
                  label="Finalize as void"
                  detail="Use the approved void rules for this market."
                  selected={action === 'VOID'}
                  disabled={activeDisputes > 0}
                  onPress={() => setAction('VOID')}
                />
              </View>
            ) : (
              <View style={{ gap: theme.spacing.sm }}>
                <VadText variant="bodyStrong">Which option matches the official result?</VadText>
                {outcomeChoicesLoading ? (
                  <View style={{ gap: theme.spacing.xs }}>
                    <VadSkeleton height={48} />
                    <VadSkeleton height={48} />
                  </View>
                ) : outcomeChoices.length ? (
                  <View style={{ gap: theme.spacing.xs }}>
                    {outcomeChoices.map((choice) => (
                      <ActionChoice
                        key={choice.outcome_code}
                        label={choice.outcome_label}
                        detail={`Option reference · ${choice.outcome_code}`}
                        selected={outcomeCode === choice.outcome_code}
                        disabled={working}
                        onPress={() => {
                          setOutcomeCode(choice.outcome_code);
                          setActionError(null);
                        }}
                      />
                    ))}
                  </View>
                ) : (
                  <VadErrorState
                    title="Result options unavailable"
                    message={outcomeChoicesError ?? 'No result options are available for this market. Refresh the queue or update the market settings.'}
                  />
                )}
              </View>
            )}

            {activeDisputes > 0 ? (
              <View
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: theme.colors.warning,
                  backgroundColor: theme.colors.warningSoft,
                  padding: theme.spacing.md,
                  gap: 2,
                }}
              >
                <VadText variant="caption" tone="warning">OPEN DISPUTE</VadText>
                <VadText variant="caption" tone="secondary">
                  {activeDisputes} active dispute{activeDisputes === 1 ? '' : 's'} must be resolved before finalization.
                </VadText>
              </View>
            ) : selectedResolutionId ? (
              <View
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: theme.colors.brandPrimary,
                  backgroundColor: theme.colors.brandSoft,
                  padding: theme.spacing.md,
                  gap: 2,
                }}
              >
                <VadText variant="caption" tone="brand">SECOND REVIEW</VadText>
                <VadText variant="caption" tone="secondary">
                  A different reviewer must confirm this result after the dispute period ends.
                </VadText>
              </View>
            ) : null}

            <VadInput
              label="Evidence note"
              value={evidenceNote}
              onChangeText={(value) => {
                setEvidenceNote(value);
                setActionError(null);
              }}
              placeholder="Summarize the evidence or reasoning for this action."
              multiline
              error={
                evidenceNote.length > 0 && evidenceNote.trim().length < 3
                  ? 'Enter at least 3 characters.'
                  : undefined
              }
            />

            {actionError ? (
              <VadErrorState title="Resolution action failed" message={actionError} />
            ) : null}

            <VadButton
              label={
                action === 'CREATE'
                  ? 'Submit result for review'
                  : action === 'FINALIZE'
                    ? 'Finalize resolution'
                    : action === 'VOID'
                      ? 'Finalize as void'
                      : 'Choose a resolution action'
              }
              variant={action === 'VOID' ? 'danger' : 'primary'}
              loading={working}
              disabled={
                !action ||
                evidenceNote.trim().length < 3 ||
                (action === 'CREATE' && (
                  !outcomeCode.trim()
                  || outcomeChoicesLoading
                  || Boolean(outcomeChoicesError)
                  || !outcomeChoices.some((choice) => choice.outcome_code === outcomeCode)
                )) ||
                (selectedResolutionId > 0 && activeDisputes > 0)
              }
              onPress={() => void submitResolutionAction()}
            />
          </View>
        ) : null}
      </VadBottomSheet>
    </View>
  );
}

function ActionChoice({
  label,
  detail,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  detail: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useVadTheme();
  return (
    <View style={{ gap: 2, paddingVertical: theme.spacing.xs }}>
      <VadButton
        label={label}
        variant={selected ? 'primary' : 'ghost'}
        disabled={disabled}
        onPress={onPress}
      />
      <VadText variant="caption" tone="tertiary">{detail}</VadText>
    </View>
  );
}

function EmptyText({ children }: { children: string }) {
  return (
    <View style={{ paddingVertical: 18 }}>
      <VadText tone="secondary">{children}</VadText>
    </View>
  );
}
