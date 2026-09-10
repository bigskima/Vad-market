import { useMemo, useState } from 'react';
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
  finalizeAdminVoid,
  hasAdminPermission,
} from '@/services/admin-control-api';

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
  const [evidenceNote, setEvidenceNote] = useState('');
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

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
        label: 'Oracle',
        count: data.oracleQueue.length,
      });
    }
    return next;
  }, [canManageMarkets, canReviewOracle, data.marketQueue.length, data.oracleQueue.length]);

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

  function openOracle(row: OracleRow) {
    if (!canReviewOracle) return;
    const resolutionId = Number(row.resolution_id ?? 0);
    setSelectedOracle(row);
    setAction(resolutionId > 0 ? null : 'CREATE');
    setOutcomeCode(String(row.outcome_code ?? ''));
    setEvidenceNote('');
    setActionError(null);
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
          throw new Error('A valid outcome code is required.');
        }
        const createdId = await createAdminProvisionalResolution({
          eventPublicId,
          outcomeCode: outcomeCode.trim(),
          evidence: { operatorNote: evidenceNote.trim() },
        });
        setActionMessage(
          `Provisional resolution ${createdId} was created. A different reviewer must finalize it after the dispute window.`,
        );
      } else if (action === 'FINALIZE') {
        if (!resolutionId) throw new Error('Resolution reference is unavailable.');
        await finalizeAdminResolution(resolutionId, {
          operatorNote: evidenceNote.trim(),
        });
        setActionMessage('Resolution finalized. Settlement remains a separate finance-controlled step.');
      } else {
        if (!resolutionId) throw new Error('Resolution reference is unavailable.');
        await finalizeAdminVoid(resolutionId, {
          operatorNote: evidenceNote.trim(),
        });
        setActionMessage('Resolution finalized as void under the active oracle policy.');
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
            Review, approve, return or reject market proposals and resolve oracle cases. Backend canonicalization, permissions, dispute windows and settlement boundaries remain authoritative.
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
              label="Oracle"
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
          <VadText variant="caption" tone="yes">GOVERNANCE ACTION RECORDED</VadText>
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
              ? 'Open a proposal to approve it with explicit canonical configuration, request clarification, or reject it.'
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
      ) : canReviewOracle ? (
        <OperationsSection
          title="Oracle queue"
          description="Create provisional outcomes and finalize eligible resolutions. Backend policy validates the outcome, dispute window and independent reviewer requirement."
          count={data.oracleQueue.length}
        >
          {data.oracleQueue.length ? (
            data.oracleQueue.map((row, index) => {
              const resolutionId = Number(row.resolution_id ?? 0);
              const disputes = Number(row.active_disputes ?? 0);
              return (
                <OperationsRow
                  key={'oracle-' + index}
                  title={String(row.event_title ?? 'Oracle case')}
                  detail={
                    resolutionId
                      ? `Provisional ${String(row.outcome_code ?? 'outcome')} · ${disputes} active dispute${disputes === 1 ? '' : 's'}`
                      : 'Awaiting provisional outcome'
                  }
                  meta={
                    row.provisional_at
                      ? `Provisional since ${new Date(String(row.provisional_at)).toLocaleString()}`
                      : `Event ${String(row.event_status ?? 'AWAITING ORACLE').replaceAll('_', ' ')}`
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
            <EmptyText>No oracle cases need attention.</EmptyText>
          )}
        </OperationsSection>
      ) : (
        <EmptyText>No governance surface is assigned to this role.</EmptyText>
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
        title={selectedResolutionId ? 'Resolution control' : 'Create provisional resolution'}
        onClose={() => {
          if (!working) setSelectedOracle(null);
        }}
      >
        {selectedOracle ? (
          <View style={{ gap: theme.spacing.lg }}>
            <View style={{ gap: 2 }}>
              <VadText variant="label" tone="brand">ORACLE CASE</VadText>
              <VadText variant="heading">
                {String(selectedOracle.event_title ?? 'Oracle event')}
              </VadText>
              <VadText variant="caption" tone="secondary" selectable>
                {String(selectedOracle.event_public_id ?? '')}
              </VadText>
            </View>

            {selectedResolutionId ? (
              <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <ActionChoice
                  label="Finalize outcome"
                  detail={`Finalize the current ${String(selectedOracle.outcome_code ?? '')} provisional outcome.`}
                  selected={action === 'FINALIZE'}
                  disabled={activeDisputes > 0}
                  onPress={() => setAction('FINALIZE')}
                />
                <ActionChoice
                  label="Finalize as void"
                  detail="Use the active oracle policy's supported void behavior."
                  selected={action === 'VOID'}
                  disabled={activeDisputes > 0}
                  onPress={() => setAction('VOID')}
                />
              </View>
            ) : (
              <VadInput
                label="Outcome code"
                value={outcomeCode}
                onChangeText={(value) => {
                  setOutcomeCode(value.toUpperCase());
                  setActionError(null);
                }}
                placeholder="e.g. YES or NO"
                autoCapitalize="characters"
                autoCorrect={false}
                hint="The backend validates this against the actual outcomes configured for the event."
              />
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
                <VadText variant="caption" tone="brand">MAKER-CHECKER</VadText>
                <VadText variant="caption" tone="secondary">
                  A different oracle reviewer must finalize the provisional result, and the configured dispute window must have ended. The server enforces both conditions.
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
                  ? 'Create provisional resolution'
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
                (action === 'CREATE' && !outcomeCode.trim()) ||
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
