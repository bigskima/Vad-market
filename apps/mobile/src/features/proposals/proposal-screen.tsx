import { router } from 'expo-router';
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
  type MarketAdmissionResponse,
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
  activeAssetCodes,
  canSubmitProposal,
  capabilityReason,
  capabilityLoading = false,
  historyLoading = false,
  historyError = null,
  onReload,
}: {
  proposals: ProposalRow[];
  activeAssetCodes: readonly string[];
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
  const [preferredAssetCode, setPreferredAssetCode] = useState(activeAssetCodes[0] ?? '');
  const [working, setWorking] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [admission, setAdmission] = useState<MarketAdmissionResponse | null>(null);

  const assetCode = activeAssetCodes.includes(preferredAssetCode)
    ? preferredAssetCode
    : activeAssetCodes[0] ?? '';
  const questionReady = Boolean(question.trim());
  const looksLikeQuestion = question.trim().endsWith('?');
  const hasAsset = Boolean(assetCode) || activeAssetCodes.length === 0;

  function resetComposer() {
    setQuestion('');
    setContext('');
    setCategory('');
    setPreferredAssetCode(activeAssetCodes[0] ?? '');
    setStep(0);
    setSubmitError(null);
    setAdmission(null);
  }

  function goNext() {
    if (step === 0 && !questionReady) return;
    if (step < 2) setStep((step + 1) as ProposalStep);
  }

  function goBack() {
    if (step > 0) setStep((step - 1) as ProposalStep);
  }

  async function submit() {
    if (capabilityLoading || !canSubmitProposal || !questionReady || !hasAsset || working) return;

    setWorking(true);
    setSubmitError(null);

    try {
      const result = await submitMarketProposal({
        question: question.trim(),
        context: context.trim() || undefined,
        category: category.trim() || undefined,
        assetCode: assetCode || undefined,
      });

      setAdmission(result);
      await onReload();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  }

  if (admission) {
    return (
      <AdmissionOutcome
        response={admission}
        onHistory={() => {
          setAdmission(null);
          setView('history');
        }}
        onCreateAnother={resetComposer}
      />
    );
  }

  return (
    <View style={{ gap: density.compact ? theme.spacing.lg : theme.spacing.xl }}>
      <View style={{ flexDirection: wide ? 'row' : 'column', justifyContent: 'space-between', gap: density.compact ? theme.spacing.sm : theme.spacing.md, alignItems: wide ? 'flex-end' : 'stretch' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="caption" tone="brand">CREATE MARKET</VadText>
          <VadText variant={density.compact ? 'heading' : 'title'}>Propose one clear outcome.</VadText>
          <VadText variant="caption" tone="secondary">
            VAD runs automated intelligence, canonical duplicate checks and deterministic safety rules first. Only exceptions need human review.
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
                    State one objective YES/NO outcome with enough timing and criteria for an independent resolver.
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
                  hint={`${question.trim().length} characters · live policy performs the final validation`}
                />

                <View style={{ gap: 6 }}>
                  <QualityRow label="Question entered" ready={questionReady} />
                  <QualityRow label="Written as a question" ready={looksLikeQuestion} advisory />
                </View>
              </View>
            ) : null}

            {step === 1 ? (
              <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
                <View style={{ gap: 2 }}>
                  <VadText variant="heading">Give VAD the resolution context.</VadText>
                  <VadText variant="caption" tone="secondary">
                    Add facts that make the market objectively resolvable. The intelligence layer will not invent missing dates, criteria or sources.
                  </VadText>
                </View>

                {activeAssetCodes.length > 0 ? (
                  <View style={{ gap: 6 }}>
                    <VadText variant="caption" tone="tertiary">SETTLEMENT ASSET</VadText>
                    <VadSegmentedControl
                      value={assetCode}
                      options={activeAssetCodes.map((code) => ({ value: code, label: code }))}
                      onChange={(value) => {
                        setPreferredAssetCode(value);
                        setSubmitError(null);
                      }}
                    />
                  </View>
                ) : (
                  <InlineStatus tone="warning" title="No settlement asset" message="No settlement asset is currently available for your account location." />
                )}

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
                  label="Resolution context"
                  value={context}
                  onChangeText={(value) => {
                    setContext(value);
                    setSubmitError(null);
                  }}
                  multiline
                  placeholder="Include the event, deadline, measurable YES condition and credible evidence source where known."
                  hint={context.trim() ? `${context.trim().length} characters` : 'Strongly recommended for automatic admission'}
                />
              </View>
            ) : null}

            {step === 2 ? (
              <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
                <View style={{ gap: 2 }}>
                  <VadText variant="heading">Ready for automated admission.</VadText>
                  <VadText variant="caption" tone="secondary">
                    AI intelligence assists with normalization and risk analysis, but server-side rules remain the publication authority.
                  </VadText>
                </View>

                <View>
                  <ReviewRow label="Question" value={question.trim()} />
                  <ReviewRow label="Settlement" value={assetCode || 'Unavailable'} />
                  <ReviewRow label="Category" value={category.trim() || 'Not specified'} />
                  <ReviewRow label="Resolution context" value={context.trim() || 'Not specified'} />
                </View>

                {capabilityLoading ? (
                  <InlineStatus tone="warning" title="Checking availability" message={runtimeCapabilityReason('CAPABILITIES_LOADING')} />
                ) : !canSubmitProposal ? (
                  <InlineStatus
                    tone="warning"
                    title="Proposal unavailable"
                    message={runtimeCapabilityReason(capabilityReason, 'Proposal creation is currently unavailable for this account under live platform policy.')}
                  />
                ) : !hasAsset ? (
                  <InlineStatus tone="warning" title="Settlement unavailable" message="Select an active settlement asset before submitting." />
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
                  label="Run admission checks"
                  loading={working || capabilityLoading}
                  disabled={capabilityLoading || !canSubmitProposal || !questionReady || !hasAsset}
                  onPress={() => void submit()}
                  style={{ flex: 1 }}
                />
              )}
            </View>
          </VadCard>

          <VadCard variant="muted" style={{ width: wide ? 310 : '100%', gap: theme.spacing.sm }}>
            <View style={{ gap: 1 }}>
              <VadText variant="caption" tone="brand">INTELLIGENT ADMISSION</VadText>
              <VadText variant="bodyStrong">How VAD handles scale</VadText>
            </View>
            <Guide number="1" title="Structure" body="Deterministic checks require a valid market shape, timing, jurisdiction and settlement asset." />
            <Guide number="2" title="Intelligence" body="Configured AI models assess clarity, objectivity, duplicate risk, manipulation risk and resolvability." />
            <Guide number="3" title="Authority" body="Only proposals that pass both layers can publish automatically. Ambiguous or risky cases go to people." />
            <Guide number="4" title="Provider-neutral" body="VAD selects enabled AI models by capability and priority, with failover instead of depending on one vendor." />
          </VadCard>
        </View>
      )}
    </View>
  );
}

function AdmissionOutcome({
  response,
  onHistory,
  onCreateAnother,
}: {
  response: MarketAdmissionResponse;
  onHistory: () => void;
  onCreateAnother: () => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const result = response.admission;
  const live = result.lane === 'AUTO_PUBLISHED';
  const merged = result.lane === 'MERGED';
  const clarification = result.lane === 'NEEDS_CLARIFICATION';
  const chipTone = live || merged ? 'yes' : clarification ? 'warning' : 'brand';
  const title = live
    ? 'Market is live.'
    : merged
      ? 'Matched an existing market.'
      : clarification
        ? 'A few details are needed.'
        : 'Sent to the exception queue.';
  const body = live
    ? 'The proposal passed deterministic validation and the active intelligence thresholds. It is now tradable.'
    : merged
      ? 'VAD detected the same canonical event and avoided creating a duplicate market.'
      : clarification
        ? 'VAD will not publish an unclear market. Update the missing details and submit a clearer proposal.'
        : 'Automated checks did not have enough confidence to publish safely, so a human review is required.';

  return (
    <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
      <VadCard variant="raised" style={{ borderColor: live || merged ? theme.colors.yes : clarification ? theme.colors.warning : theme.colors.borderStrong, gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
        <VadChip label={result.lane.replaceAll('_', ' ')} tone={chipTone} />
        <View style={{ gap: 2 }}>
          <VadText variant={density.compact ? 'heading' : 'title'}>{title}</VadText>
          <VadText variant="caption" tone="secondary">{body}</VadText>
        </View>

        <View style={{ gap: 5, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm }}>
          <VadText variant="caption" tone="tertiary">WHY</VadText>
          <VadText variant="caption" tone="secondary">{result.reason}</VadText>
          <VadText variant="caption" tone="tertiary">REFERENCE</VadText>
          <VadText variant="bodyStrong" selectable>{response.proposalId}</VadText>
        </View>

        {result.clarificationQuestions?.length ? (
          <View style={{ gap: 5 }}>
            <VadText variant="caption" tone="tertiary">CLARIFY BEFORE RESUBMITTING</VadText>
            {result.clarificationQuestions.map((item, index) => (
              <VadText key={`${item}-${index}`} variant="caption" tone="secondary">{`${index + 1}. ${item}`}</VadText>
            ))}
          </View>
        ) : null}

        {result.instrumentId ? (
          <VadButton
            label={live ? 'Open live market' : 'Open existing market'}
            onPress={() => router.push({ pathname: '/market/[marketId]', params: { marketId: result.instrumentId! } })}
          />
        ) : null}
      </VadCard>

      <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
        <VadButton label="Proposal history" onPress={onHistory} style={{ flex: 1 }} />
        <VadButton label="Create another" variant="secondary" onPress={onCreateAnother} style={{ flex: 1 }} />
      </View>
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
    return <VadEmptyState title="No proposals yet" body="Your submitted market ideas will appear here with their automated-admission or review status." actionLabel="Start a proposal" onAction={onStart} />;
  }

  return (
    <View style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
      {error ? <VadErrorState title="Proposal history refresh failed" message={error} onRetry={onRetry} /> : null}
      <View style={{ gap: 1 }}>
        <VadText variant="heading">Proposal history</VadText>
        <VadText variant="caption" tone="secondary">Most clear markets can be processed automatically; only exceptions wait for a reviewer.</VadText>
      </View>

      <View style={{ gap: density.compact ? 6 : theme.spacing.sm }}>
        {proposals.map((proposal) => {
          const displayStatus = proposal.admission_lane ?? proposal.status;
          return (
            <VadCard key={proposal.public_id} variant="raised" style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <VadText variant="bodyStrong" style={{ flex: 1 }} numberOfLines={3}>{proposal.question}</VadText>
                <VadChip label={displayStatus.replaceAll('_', ' ')} tone={proposalStatusChipTone(displayStatus)} />
              </View>
              <VadText variant="caption" tone="secondary">
                {(proposal.category ?? 'General') + ' · ' + new Date(proposal.created_at).toLocaleDateString()}
              </VadText>
              {proposal.decision_reason ? <VadText variant="caption" tone="secondary">{proposal.decision_reason}</VadText> : null}
              {proposal.clarification_questions?.length ? (
                <VadText variant="caption" tone="warning" numberOfLines={3}>{proposal.clarification_questions.join(' · ')}</VadText>
              ) : null}
              {proposal.context ? <VadText variant="caption" tone="tertiary" numberOfLines={2}>{proposal.context}</VadText> : null}
              {proposal.published_instrument_public_id ? (
                <VadButton
                  label="Open market"
                  size="small"
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/market/[marketId]', params: { marketId: proposal.published_instrument_public_id! } })}
                />
              ) : null}
            </VadCard>
          );
        })}
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
  if (normalized.includes('AUTO_PUBLISHED') || normalized.includes('MERGED') || normalized.includes('APPROV') || normalized.includes('ACTIVE') || normalized.includes('LIVE')) return 'yes';
  if (normalized.includes('REJECT') || normalized.includes('FAIL') || normalized.includes('CANCEL')) return 'no';
  if (normalized.includes('CLARIFICATION') || normalized.includes('PENDING') || normalized.includes('REVIEW')) return 'warning';
  return 'brand';
}
