import { useState } from 'react';
import {
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  submitMarketProposal,
  type ProposalRow,
} from '@/services/market-api';

type ProposalView = 'new' | 'history';
type ProposalStep = 0 | 1 | 2;

export function ProposalScreen({
  proposals,
  canSubmitProposal,
  onReload,
}: {
  proposals: ProposalRow[];
  canSubmitProposal: boolean;
  onReload: () => Promise<void>;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const compact = width < 380;
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
    if (!canSubmitProposal || !questionReady) return;

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
      setSubmitError(
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setWorking(false);
    }
  }

  if (submittedId) {
    return (
      <View style={{ gap: theme.spacing.xl }}>
        <View
          style={{
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.yes,
            backgroundColor: theme.colors.yesSoft,
            padding: compact ? theme.spacing.lg : theme.spacing.xl,
            gap: theme.spacing.md,
          }}
        >
          <VadText variant="label" tone="yes">PROPOSAL SUBMITTED</VadText>
          <VadText variant="title">Your question entered governance review.</VadText>
          <VadText tone="secondary">
            Submission does not make the market tradable. Governance still has
            to review clarity, duplication and resolution requirements.
          </VadText>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              paddingTop: theme.spacing.md,
              gap: 2,
            }}
          >
            <VadText variant="caption" tone="tertiary">REFERENCE</VadText>
            <VadText variant="bodyStrong" selectable>{submittedId}</VadText>
          </View>
        </View>

        <View
          style={{
            flexDirection: compact ? 'column' : 'row',
            gap: theme.spacing.sm,
          }}
        >
          <VadButton
            label="View proposal history"
            onPress={() => {
              setSubmittedId(null);
              setView('history');
            }}
            style={{ flex: 1 }}
          />
          <VadButton
            label="Start another proposal"
            variant="secondary"
            onPress={resetComposer}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          justifyContent: 'space-between',
          gap: theme.spacing.lg,
          alignItems: wide ? 'flex-end' : 'stretch',
        }}
      >
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="label" tone="brand">CREATE MARKET</VadText>
          <VadText variant="title">Turn one clear question into a proposal.</VadText>
          <VadText tone="secondary">
            Trading starts only after governance has reviewed the proposed
            question and the resolution path.
          </VadText>
        </View>

        <View
          accessibilityRole="tablist"
          style={{
            minWidth: wide ? 280 : undefined,
            flexDirection: 'row',
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <ModeTab
            label="New proposal"
            selected={view === 'new'}
            onPress={() => setView('new')}
          />
          <ModeTab
            label={'History ' + proposals.length}
            selected={view === 'history'}
            onPress={() => setView('history')}
          />
        </View>
      </View>

      {view === 'history' ? (
        <ProposalHistory
          proposals={proposals}
          onStart={() => {
            resetComposer();
            setView('new');
          }}
        />
      ) : (
        <View
          style={{
            flexDirection: wide ? 'row' : 'column',
            alignItems: 'flex-start',
            gap: wide ? theme.spacing.xxl : theme.spacing.lg,
          }}
        >
          <View style={{ flex: 1.35, width: '100%', gap: theme.spacing.lg }}>
            <Progress step={step} />

            {step === 0 ? (
              <View style={{ gap: theme.spacing.lg }}>
                <View style={{ gap: theme.spacing.xs }}>
                  <VadText variant="heading">What should the market ask?</VadText>
                  <VadText variant="caption" tone="secondary">
                    Write one outcome that can eventually be verified from an
                    independent source.
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
                  hint={question.trim().length + ' characters'}
                />

                <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                  <QualityRow label="Enough detail to review" ready={questionReady} />
                  <QualityRow
                    label="Written as a question"
                    ready={looksLikeQuestion}
                    advisory
                  />
                </View>
              </View>
            ) : null}

            {step === 1 ? (
              <View style={{ gap: theme.spacing.lg }}>
                <View style={{ gap: theme.spacing.xs }}>
                  <VadText variant="heading">Add useful context.</VadText>
                  <VadText variant="caption" tone="secondary">
                    Help reviewers understand the subject without trying to
                    predetermine the answer.
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
                  hint={context.trim() ? context.trim().length + ' characters' : 'Optional'}
                />
              </View>
            ) : null}

            {step === 2 ? (
              <View style={{ gap: theme.spacing.lg }}>
                <View style={{ gap: theme.spacing.xs }}>
                  <VadText variant="heading">Review before submitting.</VadText>
                  <VadText variant="caption" tone="secondary">
                    You are submitting a governance proposal, not creating an
                    immediately tradable market.
                  </VadText>
                </View>

                <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                  <ReviewRow label="Question" value={question.trim()} />
                  <ReviewRow label="Category" value={category.trim() || 'Not specified'} />
                  <ReviewRow label="Context" value={context.trim() || 'Not specified'} />
                </View>

                {!canSubmitProposal ? (
                  <InlineStatus
                    tone="warning"
                    title="Proposal unavailable"
                    message="Proposal creation is currently unavailable for this account under live platform policy."
                  />
                ) : null}

                {submitError ? (
                  <InlineStatus
                    tone="danger"
                    title="Proposal not submitted"
                    message={submitError}
                  />
                ) : null}
              </View>
            ) : null}

            <View
              style={{
                flexDirection: compact ? 'column' : 'row',
                gap: theme.spacing.sm,
              }}
            >
              {step > 0 ? (
                <VadButton
                  label="Back"
                  variant="secondary"
                  onPress={goBack}
                  style={{ flex: 1 }}
                />
              ) : null}

              {step < 2 ? (
                <VadButton
                  label="Continue"
                  disabled={step === 0 && !questionReady}
                  onPress={goNext}
                  style={{ flex: 1 }}
                />
              ) : (
                <VadButton
                  label="Submit proposal"
                  loading={working}
                  disabled={!canSubmitProposal || !questionReady}
                  onPress={() => void submit()}
                  style={{ flex: 1 }}
                />
              )}
            </View>
          </View>

          <View style={{ width: wide ? 300 : '100%', gap: theme.spacing.md }}>
            <View style={{ gap: 2 }}>
              <VadText variant="label" tone="brand">PROPOSAL GUIDE</VadText>
              <VadText variant="caption" tone="secondary">
                Three checks before you submit.
              </VadText>
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
              <Guide
                number="1"
                title="Ask one resolvable question"
                body="Avoid combining several outcomes into one market."
              />
              <Guide
                number="2"
                title="Add context, not persuasion"
                body="Explain the subject without writing the answer into the proposal."
              />
              <Guide
                number="3"
                title="Governance decides activation"
                body="Submitting does not make the market live or tradable."
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function ProposalHistory({
  proposals,
  onStart,
}: {
  proposals: ProposalRow[];
  onStart: () => void;
}) {
  const theme = useVadTheme();

  if (!proposals.length) {
    return (
      <VadEmptyState
        title="No proposals yet"
        body="Your submitted market ideas will appear here with their governance status."
        actionLabel="Start a proposal"
        onAction={onStart}
      />
    );
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 2 }}>
        <VadText variant="heading">Proposal history</VadText>
        <VadText variant="caption" tone="secondary">
          Governance status is backend-authoritative and may change after review.
        </VadText>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
        {proposals.map((proposal) => (
          <View
            key={proposal.public_id}
            style={{
              minHeight: 92,
              paddingVertical: theme.spacing.md,
              gap: theme.spacing.sm,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                gap: theme.spacing.md,
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <VadText variant="bodyStrong" style={{ flex: 1 }} numberOfLines={3}>
                {proposal.question}
              </VadText>
              <VadText variant="caption" tone={proposalStatusTone(proposal.status)}>
                {proposal.status.replaceAll('_', ' ')}
              </VadText>
            </View>

            <VadText variant="caption" tone="secondary">
              {(proposal.category ?? 'General') + ' · ' + new Date(proposal.created_at).toLocaleDateString()}
            </VadText>

            {proposal.context ? (
              <VadText variant="caption" tone="tertiary" numberOfLines={2}>
                {proposal.context}
              </VadText>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function Progress({ step }: { step: ProposalStep }) {
  const theme = useVadTheme();
  const labels = ['Question', 'Context', 'Review'];

  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
      {labels.map((label, index) => {
        const active = index <= step;
        return (
          <View key={label} style={{ flex: 1, gap: theme.spacing.xxs }}>
            <View
              style={{
                height: 4,
                borderRadius: theme.radius.pill,
                backgroundColor: active
                  ? theme.colors.brandPrimary
                  : theme.colors.surfaceMuted,
              }}
            />
            <VadText
              variant="caption"
              tone={index === step ? 'brand' : active ? 'primary' : 'tertiary'}
            >
              {label}
            </VadText>
          </View>
        );
      })}
    </View>
  );
}

function ModeTab({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 46,
        alignItems: 'center',
        justifyContent: 'center',
        borderBottomWidth: 2,
        borderBottomColor: selected ? theme.colors.brandPrimary : 'transparent',
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <VadText variant="label" tone={selected ? 'brand' : 'secondary'}>
        {label}
      </VadText>
    </Pressable>
  );
}

function QualityRow({
  label,
  ready,
  advisory = false,
}: {
  label: string;
  ready: boolean;
  advisory?: boolean;
}) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <VadText variant="label" tone={ready ? 'yes' : 'tertiary'}>
        {ready ? 'PASS' : advisory ? 'CHECK' : 'WAIT'}
      </VadText>
      <VadText variant="caption" tone={ready ? 'primary' : 'secondary'} style={{ flex: 1 }}>
        {label}{advisory ? ' · recommended' : ''}
      </VadText>
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View
      style={{
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.xs,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong">{value}</VadText>
    </View>
  );
}

function Guide({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  const theme = useVadTheme();
  return (
    <View
      style={{
        minHeight: 78,
        flexDirection: 'row',
        gap: theme.spacing.sm,
        alignItems: 'flex-start',
        paddingVertical: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <VadText variant="label" tone="brand">{number}</VadText>
      <View style={{ flex: 1, gap: 2 }}>
        <VadText variant="bodyStrong">{title}</VadText>
        <VadText variant="caption" tone="secondary">{body}</VadText>
      </View>
    </View>
  );
}

function InlineStatus({
  tone,
  title,
  message,
}: {
  tone: 'warning' | 'danger';
  title: string;
  message: string;
}) {
  const theme = useVadTheme();
  const danger = tone === 'danger';
  return (
    <View
      style={{
        borderLeftWidth: 3,
        borderLeftColor: danger ? theme.colors.danger : theme.colors.warning,
        backgroundColor: danger ? theme.colors.noSoft : theme.colors.warningSoft,
        padding: theme.spacing.md,
        gap: 2,
      }}
    >
      <VadText variant="caption" tone={tone}>{title.toUpperCase()}</VadText>
      <VadText variant="caption" tone="secondary">{message}</VadText>
    </View>
  );
}

function proposalStatusTone(
  status: string,
): 'brand' | 'yes' | 'warning' | 'danger' | 'secondary' {
  const normalized = status.toUpperCase();

  if (
    normalized.includes('APPROV') ||
    normalized.includes('ACTIVE') ||
    normalized.includes('LIVE')
  ) return 'yes';

  if (
    normalized.includes('REJECT') ||
    normalized.includes('FAIL') ||
    normalized.includes('CANCEL')
  ) return 'danger';

  if (
    normalized.includes('PENDING') ||
    normalized.includes('REVIEW')
  ) return 'warning';

  return 'brand';
}
