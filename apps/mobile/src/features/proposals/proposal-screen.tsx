import { useState } from 'react';
import {
  Alert,
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
  const [view, setView] = useState<ProposalView>('new');
  const [step, setStep] = useState<ProposalStep>(0);
  const [question, setQuestion] = useState('');
  const [context, setContext] = useState('');
  const [category, setCategory] = useState('');
  const [working, setWorking] = useState(false);

  const questionReady = question.trim().length >= 10;
  const looksLikeQuestion = question.trim().endsWith('?');

  function resetComposer() {
    setQuestion('');
    setContext('');
    setCategory('');
    setStep(0);
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
    try {
      await submitMarketProposal({
        question: question.trim(),
        context: context.trim() || undefined,
        category: category.trim() || undefined,
      });

      Alert.alert(
        'Proposal submitted',
        'Your question has entered governance review. It is not tradable until it passes the required checks.',
      );

      resetComposer();
      setView('history');
      await onReload();
    } catch (error) {
      Alert.alert(
        'Proposal not submitted',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setWorking(false);
    }
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
            The proposal enters governance first. Trading starts only after the
            market has passed clarity, duplication and resolution checks.
          </VadText>
        </View>

        <View style={{ minWidth: wide ? 250 : undefined }}>
          <View
            style={{
              flexDirection: 'row',
              padding: theme.spacing.xxs,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.surfaceRaised,
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
      </View>

      {view === 'new' ? (
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
                  onChangeText={setQuestion}
                  multiline
                  placeholder="Will … happen before …?"
                  hint={question.trim().length + ' characters'}
                />

                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: theme.colors.border,
                  }}
                >
                  <QualityRow
                    label="Enough detail to review"
                    ready={questionReady}
                  />
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
                    Context should help reviewers understand the subject without
                    trying to predetermine the answer.
                  </VadText>
                </View>

                <VadInput
                  label="Category · optional"
                  value={category}
                  onChangeText={setCategory}
                  placeholder="e.g. sports, business, technology"
                />

                <VadInput
                  label="Context · optional"
                  value={context}
                  onChangeText={setContext}
                  multiline
                  placeholder="What should reviewers understand about this question?"
                  hint={
                    context.trim()
                      ? context.trim().length + ' characters'
                      : 'Optional'
                  }
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

                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: theme.colors.border,
                  }}
                >
                  <ReviewRow label="Question" value={question.trim()} />
                  <ReviewRow
                    label="Category"
                    value={category.trim() || 'Not specified'}
                  />
                  <ReviewRow
                    label="Context"
                    value={context.trim() || 'Not specified'}
                  />
                </View>

                {!canSubmitProposal ? (
                  <View
                    style={{
                      borderLeftWidth: 3,
                      borderLeftColor: theme.colors.warning,
                      borderRadius: theme.radius.md,
                      backgroundColor: theme.colors.warningSoft,
                      padding: theme.spacing.md,
                    }}
                  >
                    <VadText variant="caption" tone="warning">
                      Proposal creation is currently unavailable for this
                      account under live platform policy.
                    </VadText>
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
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

          <View
            style={{
              width: wide ? 290 : '100%',
              borderRadius: theme.radius.xl,
              backgroundColor: theme.colors.surfaceRaised,
              padding: theme.spacing.lg,
              gap: theme.spacing.md,
            }}
          >
            <VadText variant="label" tone="brand">PROPOSAL GUIDE</VadText>
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
      ) : (
        <ProposalHistory
          proposals={proposals}
          onStart={() => setView('new')}
        />
      )}
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
              tone={
                index === step
                  ? 'brand'
                  : active
                    ? 'primary'
                    : 'tertiary'
              }
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
        minHeight: 44,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? theme.colors.surface : 'transparent',
        opacity: pressed ? 0.7 : 1,
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
        minHeight: 54,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: ready
            ? theme.colors.yesSoft
            : theme.colors.surfaceRaised,
        }}
      >
        <VadText
          variant="caption"
          tone={ready ? 'yes' : advisory ? 'tertiary' : 'secondary'}
        >
          {ready ? '✓' : '–'}
        </VadText>
      </View>

      <VadText
        variant="caption"
        tone={ready ? 'primary' : 'secondary'}
        style={{ flex: 1 }}
      >
        {label}
        {advisory ? ' · recommended' : ''}
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
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.brandSoft,
        }}
      >
        <VadText variant="caption" tone="brand">{number}</VadText>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <VadText variant="bodyStrong">{title}</VadText>
        <VadText variant="caption" tone="secondary">{body}</VadText>
      </View>
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
      <View style={{ gap: theme.spacing.md }}>
        <VadEmptyState
          title="No proposals yet"
          body="Your submitted market ideas will appear here with their governance status."
        />
        <VadButton
          label="Start a proposal"
          fullWidth={false}
          onPress={onStart}
        />
      </View>
    );
  }

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
      }}
    >
      {proposals.map((proposal) => (
        <View
          key={proposal.public_id}
          style={{
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            paddingVertical: theme.spacing.md,
            gap: theme.spacing.sm,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.sm,
              alignItems: 'flex-start',
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <VadText variant="bodyStrong">{proposal.question}</VadText>
              <VadText variant="caption" tone="tertiary">
                {proposal.category ?? 'Uncategorised'} ·{' '}
                {new Date(proposal.created_at).toLocaleDateString()}
              </VadText>
            </View>

            <View
              style={{
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.brandSoft,
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: theme.spacing.xs,
              }}
            >
              <VadText variant="caption" tone="brand">
                {proposal.status.replaceAll('_', ' ')}
              </VadText>
            </View>
          </View>

          {proposal.context ? (
            <VadText
              variant="caption"
              tone="secondary"
              numberOfLines={2}
            >
              {proposal.context}
            </VadText>
          ) : null}
        </View>
      ))}
    </View>
  );
}
