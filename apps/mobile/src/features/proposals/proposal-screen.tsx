import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { submitMarketProposal, type ProposalRow } from '@/services/market-api';

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
  const [view, setView] = useState<ProposalView>('new');
  const [step, setStep] = useState<ProposalStep>(0);
  const [question, setQuestion] = useState('');
  const [context, setContext] = useState('');
  const [category, setCategory] = useState('');
  const [working, setWorking] = useState(false);

  const questionReady = question.trim().length >= 10;

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
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">CREATE MARKET</VadText>
        <VadText variant="title">Turn a clear question into a proposal.</VadText>
        <VadText tone="secondary">
          VAD reviews clarity, duplication and resolvability before any proposal can become a live market.
        </VadText>
      </View>

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

      {view === 'new' ? (
        <View style={{ gap: theme.spacing.lg }}>
          <Progress step={step} />

          {step === 0 ? (
            <View style={{ gap: theme.spacing.lg }}>
              <View style={{ gap: theme.spacing.xs }}>
                <VadText variant="heading">What should the market ask?</VadText>
                <VadText variant="caption" tone="secondary">
                  Use one question with an outcome that can be independently verified.
                </VadText>
              </View>

              <VadInput
                label="Market question"
                value={question}
                onChangeText={setQuestion}
                multiline
                placeholder="Will … happen before …?"
              />

              <View
                style={{
                  borderRadius: theme.radius.lg,
                  backgroundColor: questionReady
                    ? theme.colors.yesSoft
                    : theme.colors.surfaceRaised,
                  padding: theme.spacing.md,
                }}
              >
                <VadText
                  variant="caption"
                  tone={questionReady ? 'yes' : 'secondary'}
                >
                  {questionReady
                    ? 'Question length looks ready for the next step.'
                    : 'Write at least 10 characters and make the outcome specific.'}
                </VadText>
              </View>
            </View>
          ) : null}

          {step === 1 ? (
            <View style={{ gap: theme.spacing.lg }}>
              <View style={{ gap: theme.spacing.xs }}>
                <VadText variant="heading">Add useful context.</VadText>
                <VadText variant="caption" tone="secondary">
                  Help reviewers understand the subject without trying to predetermine the outcome.
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
                placeholder="Why this question matters or what reviewers should understand"
              />
            </View>
          ) : null}

          {step === 2 ? (
            <View style={{ gap: theme.spacing.lg }}>
              <View style={{ gap: theme.spacing.xs }}>
                <VadText variant="heading">Review before submitting.</VadText>
                <VadText variant="caption" tone="secondary">
                  This creates a proposal for governance review, not an immediately tradable market.
                </VadText>
              </View>

              <ReviewRow label="Question" value={question.trim()} />
              <ReviewRow label="Category" value={category.trim() || 'Not specified'} />
              <ReviewRow label="Context" value={context.trim() || 'Not specified'} />

              {!canSubmitProposal ? (
                <View
                  style={{
                    borderRadius: theme.radius.lg,
                    backgroundColor: theme.colors.warningSoft,
                    padding: theme.spacing.md,
                  }}
                >
                  <VadText variant="caption" tone="warning">
                    Proposal creation is currently unavailable for this account under the live platform policy.
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
              />
            ) : null}

            {step < 2 ? (
              <VadButton
                label="Continue"
                disabled={step === 0 && !questionReady}
                onPress={goNext}
              />
            ) : (
              <VadButton
                label="Submit proposal"
                loading={working}
                disabled={!canSubmitProposal || !questionReady}
                onPress={() => void submit()}
              />
            )}
          </View>
        </View>
      ) : (
        <ProposalHistory proposals={proposals} onStart={() => setView('new')} />
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
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 44,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? theme.colors.surface : 'transparent',
      }}
    >
      <VadText variant="label" tone={selected ? 'brand' : 'secondary'}>
        {label}
      </VadText>
    </Pressable>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        paddingBottom: theme.spacing.md,
        gap: theme.spacing.xs,
      }}
    >
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong">{value}</VadText>
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
        <VadButton label="Start a proposal" onPress={onStart} />
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
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
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <VadText variant="bodyStrong">{proposal.question}</VadText>
              <VadText variant="caption" tone="tertiary">
                {proposal.category ?? 'Uncategorised'} · {new Date(proposal.created_at).toLocaleDateString()}
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
            <VadText variant="caption" tone="secondary" numberOfLines={2}>
              {proposal.context}
            </VadText>
          ) : null}
        </View>
      ))}
    </View>
  );
}
