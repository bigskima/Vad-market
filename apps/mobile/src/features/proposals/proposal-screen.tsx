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
  const hasAsset = Boolean(assetCode);

  function resetComposer() {
    setQuestion('');
    setContext('');
    setCategory('');
    setPreferredAssetCode(activeAssetCodes[0] ?? '');
    setStep(0);
    setSubmitError(null);
    setAdmission(null);
  }

  function reviseProposal() {
    setAdmission(null);
    setView('new');
    setStep(1);
    setSubmitError(null);
  }

  function goNext() {
    if (step === 0 && !questionReady) return;
    if (step === 1 && !hasAsset) return;
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
        assetCode,
      });

      setAdmission(result);
      await onReload();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'We could not submit this proposal right now. Please try again.');
    } finally {
      setWorking(false);
    }
  }

  if (admission) {
    return (
      <AdmissionOutcome
        response={admission}
        onRevise={reviseProposal}
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
            VAD checks that your question is clear, is not already available, and can be decided fairly before it goes live. Some proposals may need an extra review.
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
                    Write one clear YES/NO question. Include a deadline or condition that makes the final result easy to check.
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
                  hint={`${question.trim().length} characters · VAD will check your question before submission`}
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
                  <VadText variant="heading">Explain how the result should be decided.</VadText>
                  <VadText variant="caption" tone="secondary">
                    Add the deadline, the exact YES condition and the source that can confirm what happened.
                  </VadText>
                </View>

                {activeAssetCodes.length > 0 ? (
                  <View style={{ gap: 6 }}>
                    <VadText variant="caption" tone="tertiary">MARKET CURRENCY</VadText>
                    <VadSegmentedControl
                      value={assetCode}
                      options={activeAssetCodes.map((code) => ({ value: code, label: code }))}
                      onChange={(value) => {
                        setPreferredAssetCode(value);
                        setSubmitError(null);
                      }}
                    />
                    <VadText variant="caption" tone="secondary">
                      This is the currency used for trading and payouts. NGN and USDC balances stay separate.
                    </VadText>
                  </View>
                ) : (
                  <InlineStatus tone="warning" title="Currency unavailable" message="No supported currency is available in your location right now. Please try again later." />
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
                  label="How will the result be decided?"
                  value={context}
                  onChangeText={(value) => {
                    setContext(value);
                    setSubmitError(null);
                  }}
                  multiline
                  placeholder="Add the deadline, exact YES condition and a trusted source that can confirm the result."
                  hint={context.trim() ? `${context.trim().length} characters` : 'Adding these details can make the review faster and clearer'}
                />
              </View>
            ) : null}

            {step === 2 ? (
              <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
                <View style={{ gap: 2 }}>
                  <VadText variant="heading">Ready to submit.</VadText>
                  <VadText variant="caption" tone="secondary">
                    VAD will check whether the question is clear, already exists, and has enough information to decide the result fairly.
                  </VadText>
                </View>

                <View>
                  <ReviewRow label="Question" value={question.trim()} />
                  <ReviewRow label="Currency" value={assetCode || 'Unavailable'} />
                  <ReviewRow label="Category" value={category.trim() || 'Not specified'} />
                  <ReviewRow label="How the result will be decided" value={context.trim() || 'Not specified'} />
                </View>

                {capabilityLoading ? (
                  <InlineStatus tone="warning" title="Checking availability" message={runtimeCapabilityReason('CAPABILITIES_LOADING')} />
                ) : !canSubmitProposal ? (
                  <InlineStatus
                    tone="warning"
                    title="Proposal unavailable"
                    message={runtimeCapabilityReason(capabilityReason, 'Market proposals are not available for your account right now.')}
                  />
                ) : !hasAsset ? (
                  <InlineStatus tone="warning" title="Currency unavailable" message="Select an available currency before submitting." />
                ) : null}

                {submitError ? (
                  <InlineStatus tone="danger" title="Proposal not submitted" message={submitError} />
                ) : null}
              </View>
            ) : null}

            <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
              {step > 0 ? <VadButton label="Back" variant="secondary" disabled={working} onPress={goBack} style={{ flex: 1 }} /> : null}
              {step < 2 ? (
                <VadButton
                  label="Continue"
                  disabled={(step === 0 && !questionReady) || (step === 1 && !hasAsset)}
                  onPress={goNext}
                  style={{ flex: 1 }}
                />
              ) : (
                <VadButton
                  label="Submit proposal"
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
              <VadText variant="caption" tone="brand">BEFORE A MARKET GOES LIVE</VadText>
              <VadText variant="bodyStrong">What VAD checks</VadText>
            </View>
            <Guide number="1" title="Clear question" body="The market needs one clear outcome and a clear time frame." />
            <Guide number="2" title="Clear result" body="There must be enough information and evidence to decide YES or NO fairly." />
            <Guide number="3" title="Existing market" body="If the same market already exists, VAD links you to it instead of creating a duplicate." />
            <Guide number="4" title="Final review" body="Clear proposals may publish quickly. Others may need more details or an extra review first." />
          </VadCard>
        </View>
      )}
    </View>
  );
}

function AdmissionOutcome({
  response,
  onRevise,
  onHistory,
  onCreateAnother,
}: {
  response: MarketAdmissionResponse;
  onRevise: () => void;
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
      ? 'A matching market already exists.'
      : clarification
        ? 'A few details are needed.'
        : 'Submitted for review.';
  const body = live
    ? 'Your proposal passed the checks and is now available for trading.'
    : merged
      ? 'VAD found an existing market for the same outcome, so a duplicate was not created.'
      : clarification
        ? 'Add the requested details to make the final result clear. Your current draft has been preserved.'
        : 'This proposal needs an extra review before it can be published.';

  return (
    <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
      <VadCard variant="raised" accessibilityRole="summary" style={{ borderColor: live || merged ? theme.colors.yes : clarification ? theme.colors.warning : theme.colors.borderStrong, gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
        <VadChip label={proposalStatusLabel(result.lane)} tone={chipTone} />
        <View style={{ gap: 2 }}>
          <VadText variant={density.compact ? 'heading' : 'title'}>{title}</VadText>
          <VadText variant="caption" tone="secondary">{body}</VadText>
        </View>

        <View style={{ gap: 5, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm }}>
          <VadText variant="caption" tone="tertiary">WHAT HAPPENED</VadText>
          <VadText variant="caption" tone="secondary">{proposalDecisionCopy(result.lane)}</VadText>
          <VadText variant="caption" tone="tertiary">PROPOSAL REFERENCE</VadText>
          <VadText variant="bodyStrong" selectable>{response.proposalId}</VadText>
        </View>

        {result.clarificationQuestions?.length ? (
          <View style={{ gap: 5 }}>
            <VadText variant="caption" tone="tertiary">DETAILS TO ADD</VadText>
            {result.clarificationQuestions.map((item, index) => (
              <VadText key={`${item}-${index}`} variant="caption" tone="secondary">{`${index + 1}. ${item}`}</VadText>
            ))}
          </View>
        ) : null}

        {clarification ? (
          <VadButton label="Revise this proposal" onPress={onRevise} />
        ) : result.instrumentId ? (
          <VadButton
            label={live ? 'Open live market' : 'Open existing market'}
            onPress={() => router.push({ pathname: '/market/[marketId]', params: { marketId: result.instrumentId! } })}
          />
        ) : null}
      </VadCard>

      <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
        <VadButton label="Proposal history" variant={clarification ? 'secondary' : 'primary'} onPress={onHistory} style={{ flex: 1 }} />
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
    return <VadEmptyState title="No proposals yet" body="Your submitted market ideas will appear here with their publication or review status." actionLabel="Start a proposal" onAction={onStart} />;
  }

  return (
    <View style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
      {error ? <VadErrorState title="Could not refresh proposal history" message={error} onRetry={onRetry} /> : null}
      <View style={{ gap: 1 }}>
        <VadText variant="heading">Proposal history</VadText>
        <VadText variant="caption" tone="secondary">
          See whether each idea was published, matched an existing market, needs more details, or is still being reviewed.
        </VadText>
      </View>

      <View style={{ gap: density.compact ? 6 : theme.spacing.sm }}>
        {proposals.map((proposal) => {
          const displayStatus = proposal.admission_lane ?? proposal.status;
          return (
            <VadCard key={proposal.public_id} variant="raised" style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <VadText variant="bodyStrong" style={{ flex: 1 }} numberOfLines={3}>{proposal.question}</VadText>
                <VadChip label={proposalStatusLabel(displayStatus)} tone={proposalStatusChipTone(displayStatus)} />
              </View>
              <VadText variant="caption" tone="secondary">
                {(proposal.category ?? 'General') + ' · ' + new Date(proposal.created_at).toLocaleDateString()}
              </VadText>
              <VadText variant="caption" tone="secondary">{proposalDecisionCopy(displayStatus)}</VadText>
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
  const labels = ['Question', 'Details', 'Review'];

  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 3, now: step + 1 }} style={{ flexDirection: 'row', gap: density.compact ? 6 : theme.spacing.xs }}>
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
      <VadChip label={ready ? 'READY' : advisory ? 'RECOMMENDED' : 'NEEDED'} tone={ready ? 'yes' : 'neutral'} />
      <VadText variant="caption" tone={ready ? 'primary' : 'secondary'} style={{ flex: 1 }}>{label}</VadText>
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
    <View accessibilityRole="alert" style={{ borderLeftWidth: 3, borderLeftColor: danger ? theme.colors.danger : theme.colors.warning, backgroundColor: danger ? theme.colors.noSoft : theme.colors.warningSoft, padding: density.compact ? 10 : theme.spacing.md, gap: 2, borderRadius: theme.radius.sm }}>
      <VadText variant="caption" tone={tone}>{title.toUpperCase()}</VadText>
      <VadText variant="caption" tone="secondary">{message}</VadText>
    </View>
  );
}

function proposalStatusLabel(status: string) {
  const normalized = status.toUpperCase();
  if (normalized.includes('AUTO_PUBLISHED') || normalized.includes('PUBLISHED') || normalized.includes('ACTIVE') || normalized.includes('LIVE')) return 'PUBLISHED';
  if (normalized.includes('MERGED')) return 'MATCHED';
  if (normalized.includes('CLARIFICATION')) return 'NEEDS DETAILS';
  if (normalized.includes('REVIEW') || normalized.includes('PENDING')) return 'IN REVIEW';
  if (normalized.includes('REJECT') || normalized.includes('FAIL')) return 'NOT PUBLISHED';
  if (normalized.includes('CANCEL')) return 'CANCELLED';
  return 'SUBMITTED';
}

function proposalDecisionCopy(status: string) {
  const normalized = status.toUpperCase();
  if (normalized.includes('AUTO_PUBLISHED') || normalized.includes('PUBLISHED') || normalized.includes('ACTIVE') || normalized.includes('LIVE')) {
    return 'This proposal passed the checks and became a live market.';
  }
  if (normalized.includes('MERGED')) {
    return 'A matching market already exists, so a duplicate was not created.';
  }
  if (normalized.includes('CLARIFICATION')) {
    return 'More detail is needed before this proposal can move forward.';
  }
  if (normalized.includes('REVIEW') || normalized.includes('PENDING')) {
    return 'This proposal is waiting for an extra review.';
  }
  if (normalized.includes('REJECT') || normalized.includes('FAIL')) {
    return 'This proposal was not approved for publishing.';
  }
  if (normalized.includes('CANCEL')) {
    return 'This proposal was cancelled.';
  }
  return 'This proposal has been submitted.';
}

function proposalStatusChipTone(status: string): 'brand' | 'yes' | 'warning' | 'no' {
  const normalized = status.toUpperCase();
  if (normalized.includes('AUTO_PUBLISHED') || normalized.includes('MERGED') || normalized.includes('APPROV') || normalized.includes('ACTIVE') || normalized.includes('LIVE')) return 'yes';
  if (normalized.includes('REJECT') || normalized.includes('FAIL') || normalized.includes('CANCEL')) return 'no';
  if (normalized.includes('CLARIFICATION') || normalized.includes('PENDING') || normalized.includes('REVIEW')) return 'warning';
  return 'brand';
}
