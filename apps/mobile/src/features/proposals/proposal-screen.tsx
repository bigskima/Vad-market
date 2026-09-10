import { useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { runtimeCapabilityReason } from '@/features/policy/runtime-capability-copy';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import {
  submitMarketProposal,
  type ProposalRow,
} from '@/services/market-api';

type ProposalView = 'new' | 'history';
type ProposalStep = 0 | 1 | 2;

const VIEWS = [
  { value: 'new', label: 'New proposal' },
  { value: 'history', label: 'History' },
] as const;

export function ProposalScreen({
  proposals,
  canSubmitProposal,
  capabilityReason,
  capabilityLoading = false,
  historyLoading = false,
  historyError = null,
  onReload,
}: {
  proposals: ProposalRow[];
  canSubmitProposal: boolean;
  capabilityReason?: string;
  capabilityLoading?: boolean;
  historyLoading?: boolean;
  historyError?: string | null;
  onReload: () => Promise<void>;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const wide = density.width >= 860;
  const [view, setView] = useState<ProposalView>('new');
  const [step, setStep] = useState<ProposalStep>(0);
  const [question, setQuestion] = useState('');
  const [context, setContext] = useState('');
  const [category, setCategory] = useState('');
  const [working, setWorking] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const questionReady = question.trim().length >= 10;
  const looksLikeQuestion = question.trim().endsWith('?');

  function resetComposer() {
    setQuestion('');
    setContext('');
    setCategory('');
    setStep(0);
    setSubmitError(null);
    setSubmittedId(null);
  }

  function goNext() {
    if (step === 0 && !questionReady) return;
    if (step < 2) setStep((step + 1) as ProposalStep);
  }

  function goBack() {
    if (step > 0) setStep((step - 1) as ProposalStep);
  }

  async function submit() {
    if (capabilityLoading || !canSubmitProposal || !questionReady || working) return;

    setWorking(true);
    setSubmitError(null);

    try {
      const id = await submitMarketProposal({
        question: question.trim(),
        context: context.trim() || undefined,
        category: category.trim() || undefined,
      });

      setSubmittedId(id);
      await onReload();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  }

  if (submittedId) {
    return (
      <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
        <VadCard variant="raised" style={{ borderColor: theme.colors.yes, gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
          <VadChip label="PROPOSAL SUBMITTED" tone="yes" />
          <View style={{ gap: 2 }}>
            <VadText variant={density.compact ? 'heading' : 'title'}>Sent for governance review.</VadText>
            <VadText variant="caption" tone="secondary">
              The proposal is not tradable yet. Governance still reviews clarity, duplication and resolution requirements.
            </VadText>
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm, gap: 1 }}>
            <VadText variant="caption" tone="tertiary">REFERENCE</VadText>
            <VadText variant="bodyStrong" selectable>{submittedId}</VadText>
          </View>
        </VadCard>

        <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
          <VadButton
            label="Proposal history"
            onPress={() => {
              setSubmittedId(null);
              setView('history');
            }}
            style={{ flex: 1 }}
          />
          <VadButton
            label="Create another"
            variant="secondary"
            onPress={resetComposer}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: density.compact ? theme.spacing.lg : theme.spacing.xl }}>
      <View style={{ flexDirection: wide ? 'row' : 'column', justifyContent: 'space-between', gap: density.compact ? theme.spacing.sm : theme.spacing.md, alignItems: wide ? 'flex-end' : 'stretch' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="caption" tone="brand">CREATE MARKET</VadText>
          <VadText variant={density.compact ? 'heading' : 'title'}>Propose one clear outcome.</VadText>
          <VadText variant="caption" tone="secondary">
            Governance reviews the question before any market can go live.
          </VadText>
        </View>

        <View style={{ minWidth: wide ? 280 : undefined }}>
          <VadSegmentedControl
            value={view}
            options={VIEWS.map((item) => item.value === 'history' ? { ...item, label: `History ${proposals.length}` } : item)}
            onChange={setView}
          />
        </View>
      </View>

      {view === 'history' ? (
        <ProposalHistory
          proposals={proposals}
          loading={historyLoading}
          error={historyError}
          onRetry={() => void onReload()}
          onStart={() => {
            resetComposer();
            setView('new');
          }}
        />
      ) : (
        <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'flex-start', gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
          <VadCard variant="raised" style={{ flex: 1.35, width: '100%', gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
            <Progress step={step} />

            {step === 0 ? (
              <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
                <View style={{ gap: 2 }}>
                  <VadText variant="heading">What should the market ask?</VadText>
                  <VadText variant="caption" tone="secondary">
                    Write one outcome that can eventually be verified independently.
                  </VadText>
                </View>

                <VadInput
                  label="Market question"
                  value={question}
                  onChangeText={(value) => {
                    setQuestion(value);
                    setSubmitError(null);
                  }}
                  multiline
                  placeholder="Will … happen before …?"
                  hint={`${question.trim().length} characters`}
                />

                <View style={{ gap: 6 }}>
                  <QualityRow label="Enough detail to review" ready={questionReady} />
                  <QualityRow label="Written as a question" ready={looksLikeQuestion} advisory />
                </View>
              </View>
            ) : null}

            {step === 1 ? (
              <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
                <View style={{ gap: 2 }}>
                  <VadText variant="heading">Add useful context.</VadText>
                  <VadText variant="caption" tone="secondary">
                    Help reviewers understand the subject without trying to predetermine the answer.
                  </VadText>
                </View>

                <VadInput
                  label="Category · optional"
                  value={category}
                  onChangeText={(value) => {
                    setCategory(value);
                    setSubmitError(null);
                  }}
                  placeholder="e.g. sports, business, technology"
                />

                <VadInput
                  label="Context · optional"
                  value={context}
                  onChangeText={(value) => {
                    setContext(value);
                    setSubmitError(null);
                  }}
                  multiline
                  placeholder="What should reviewers understand about this question?"
                  hint={context.trim() ? `${context.trim().length} characters` : 'Optional'}
                />
              </View>
            ) : null}

            {step === 2 ? (
              <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
                <View style={{ gap: 2 }}>
                  <VadText variant="heading">Review before submitting.</VadText>
                  <VadText variant="caption" tone="secondary">
                    This sends a governance proposal; it does not create an immediately tradable market.
                  </VadText>
                </View>

                <View>
                  <ReviewRow label="Question" value={question.trim()} />
                  <ReviewRow label="Category" value={category.trim() || 'Not specified'} />
                  <ReviewRow label="Context" value={context.trim() || 'Not specified'} />
                </View>

                {capabilityLoading ? (
                  <InlineStatus tone="warning" title="Checking availability" message={runtimeCapabilityReason('CAPABILITIES_LOADING')} />
                ) : !canSubmitProposal ? (
                  <InlineStatus
                    tone="warning"
                    title="Proposal unavailable"
                    message={runtimeCapabilityReason(capabilityReason, 'Proposal creation is currently unavailable for this account under live platform policy.')}
                  />
                ) : null}

                {submitError ? (
                  <InlineStatus tone="danger" title="Proposal not submitted" message={submitError} />
                ) : null}
              </View>
            ) : null}

            <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
              {step > 0 ? <VadButton label="Back" variant="secondary" onPress={goBack} style={{ flex: 1 }} /> : null}
              {step < 2 ? (
                <VadButton label="Continue" disabled={step === 0 && !questionReady} onPress={goNext} style={{ flex: 1 }} />
              ) : (
                <VadButton
                  label="Submit proposal"
                  loading={working || capabilityLoading}
                  disabled={capabilityLoading || !canSubmitProposal || !questionReady}
                  onPress={() => void submit()}
                  style={{ flex: 1 }}
                />
              )}
            </View>
          </VadCard>

          <VadCard variant="muted" style={{ width: wide ? 300 : '100%', gap: theme.spacing.sm }}>
            <View style={{ gap: 1 }}>
              <VadText variant="caption" tone="brand">PROPOSAL GUIDE</VadText>
              <VadText variant="bodyStrong">Before you submit</VadText>
            </View>
            <Guide number="1" title="One resolvable question" body="Avoid combining several outcomes." />
            <Guide number="2" title="Context, not persuasion" body="Explain the subject without writing the answer." />
            <Guide number="3" title="Governance activates" body="Submission never makes a market live by itself." />
          </VadCard>
        </View>
      )}
    </View>
  );
}

function ProposalHistory({ proposals, loading, error, onRetry, onStart }: { proposals: ProposalRow[]; loading: boolean; error: string | null; onRetry: () => void; onStart: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();

  if (loading && !proposals.length) {
    return (
      <View style={{ gap: theme.spacing.sm }}>
        <VadSkeleton width="42%" height={24} />
        <VadSkeleton height={density.compact ? 72 : 82} radius={theme.radius.lg} />
        <VadSkeleton height={density.compact ? 72 : 82} radius={theme.radius.lg} />
      </View>
    );
  }

  if (error && !proposals.length) {
    return <VadErrorState title="Proposal history unavailable" message={error} onRetry={onRetry} />;
  }

  if (!proposals.length) {
    return <VadEmptyState title="No proposals yet" body="Your submitted market ideas will appear here with their governance status." actionLabel="Start a proposal" onAction={onStart} />;
  }

  return (
    <View style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
      {error ? <VadErrorState title="Proposal history refresh failed" message={error} onRetry={onRetry} /> : null}
      <View style={{ gap: 1 }}>
        <VadText variant="heading">Proposal history</VadText>
        <VadText variant="caption" tone="secondary">Governance status may change after review.</VadText>
      </View>

      <View style={{ gap: density.compact ? 6 : theme.spacing.sm }}>
        {proposals.map((proposal) => (
          <VadCard key={proposal.public_id} variant="raised" style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <VadText variant="bodyStrong" style={{ flex: 1 }} numberOfLines={3}>{proposal.question}</VadText>
              <VadChip label={proposal.status.replaceAll('_', ' ')} tone={proposalStatusChipTone(proposal.status)} />
            </View>
            <VadText variant="caption" tone="secondary">
              {(proposal.category ?? 'General') + ' · ' + new Date(proposal.created_at).toLocaleDateString()}
            </VadText>
            {proposal.context ? <VadText variant="caption" tone="tertiary" numberOfLines={2}>{proposal.context}</VadText> : null}
          </VadCard>
        ))}
      </View>
    </View>
  );
}

function Progress({ step }: { step: ProposalStep }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const labels = ['Question', 'Context', 'Review'];

  return (
    <View style={{ flexDirection: 'row', gap: density.compact ? 6 : theme.spacing.xs }}>
      {labels.map((label, index) => {
        const active = index <= step;
        return (
          <View key={label} style={{ flex: 1, gap: 3 }}>
            <View style={{ height: density.compact ? 3 : 4, borderRadius: theme.radius.pill, backgroundColor: active ? theme.colors.brandPrimary : theme.colors.surfaceMuted }} />
            <VadText variant="caption" tone={index === step ? 'brand' : active ? 'primary' : 'tertiary'} numberOfLines={1}>{label}</VadText>
          </View>
        );
      })}
    </View>
  );
}

function QualityRow({ label, ready, advisory = false }: { label: string; ready: boolean; advisory?: boolean }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 34 }}>
      <VadChip label={ready ? 'PASS' : advisory ? 'CHECK' : 'WAIT'} tone={ready ? 'yes' : 'neutral'} />
      <VadText variant="caption" tone={ready ? 'primary' : 'secondary'} style={{ flex: 1 }}>{label}{advisory ? ' · recommended' : ''}</VadText>
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  return (
    <View style={{ paddingVertical: density.compact ? 8 : theme.spacing.sm, gap: 3, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong">{value}</VadText>
    </View>
  );
}

function Guide({ number, title, body }: { number: string; title: string; body: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start', paddingTop: 6 }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: theme.colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
        <VadText variant="caption" tone="brand">{number}</VadText>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <VadText variant="caption" tone="primary" style={{ fontWeight: '700' }}>{title}</VadText>
        <VadText variant="caption" tone="secondary">{body}</VadText>
      </View>
    </View>
  );
}

function InlineStatus({ tone, title, message }: { tone: 'warning' | 'danger'; title: string; message: string }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const danger = tone === 'danger';
  return (
    <View style={{ borderLeftWidth: 3, borderLeftColor: danger ? theme.colors.danger : theme.colors.warning, backgroundColor: danger ? theme.colors.noSoft : theme.colors.warningSoft, padding: density.compact ? 10 : theme.spacing.md, gap: 2, borderRadius: theme.radius.sm }}>
      <VadText variant="caption" tone={tone}>{title.toUpperCase()}</VadText>
      <VadText variant="caption" tone="secondary">{message}</VadText>
    </View>
  );
}

function proposalStatusChipTone(status: string): 'brand' | 'yes' | 'warning' | 'no' {
  const normalized = status.toUpperCase();
  if (normalized.includes('APPROV') || normalized.includes('ACTIVE') || normalized.includes('LIVE')) return 'yes';
  if (normalized.includes('REJECT') || normalized.includes('FAIL') || normalized.includes('CANCEL')) return 'no';
  if (normalized.includes('PENDING') || normalized.includes('REVIEW')) return 'warning';
  return 'brand';
}
