import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { submitMarketProposal, type ProposalRow } from '@/services/market-api';

export function ProposalScreen({ proposals, canSubmitProposal, onReload }: { proposals: ProposalRow[]; canSubmitProposal: boolean; onReload: () => Promise<void> }) {
  const theme = useVadTheme();
  const [composerOpen, setComposerOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [context, setContext] = useState('');
  const [category, setCategory] = useState('');
  const [working, setWorking] = useState(false);

  async function submit() {
    setWorking(true);
    try {
      await submitMarketProposal({
        question: question.trim(),
        context: context.trim() || undefined,
        category: category.trim() || undefined,
      });
      setQuestion('');
      setContext('');
      setCategory('');
      setComposerOpen(false);
      Alert.alert('Proposal submitted', 'Governance will review duplication, clarity and resolvability before any financial market can activate.');
      await onReload();
    } catch (error) {
      Alert.alert('Proposal not submitted', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  }

  return <View style={{ gap: theme.spacing.xl }}>
    <View style={{ gap: theme.spacing.xs }}>
      <VadText variant="label" tone="brand">CREATE</VadText>
      <VadText variant="title">Propose the next question.</VadText>
      <VadText tone="secondary">A proposal starts governance review. It does not create a tradable market automatically.</VadText>
    </View>

    <VadCard
      style={{
        backgroundColor: theme.colors.brandPrimary,
        borderColor: theme.colors.brandPrimary,
        borderRadius: theme.radius.xl,
        gap: theme.spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <VadText variant="caption" tone="inverse">MARKET PROPOSAL</VadText>
          <VadText variant="heading" tone="inverse">{composerOpen ? 'Build a clear, resolvable question' : 'Have a market idea?'}</VadText>
        </View>
        <VadButton
          fullWidth={false}
          label={composerOpen ? 'Close' : 'New proposal'}
          variant="secondary"
          onPress={() => setComposerOpen((value) => !value)}
        />
      </View>
      <VadText variant="caption" tone="inverse">Proposal → governance review → canonical event → oracle policy → possible activation.</VadText>
    </VadCard>

    {composerOpen ? <VadCard variant="raised" style={{ gap: theme.spacing.md, borderRadius: theme.radius.xl }}>
      <View style={{ gap: theme.spacing.xxs }}>
        <VadText variant="heading">Proposal details</VadText>
        <VadText variant="caption" tone="secondary">Use one measurable outcome and include enough context for independent resolution.</VadText>
      </View>
      <VadInput label="Question" value={question} onChangeText={setQuestion} multiline placeholder="Will … happen before …?" />
      <VadInput label="Context · optional" value={context} onChangeText={setContext} multiline placeholder="Why this matters or what reviewers should know" />
      <VadInput label="Category · optional" value={category} onChangeText={setCategory} placeholder="e.g. sports, business, technology" />

      {!canSubmitProposal ? (
        <VadCard variant="muted" style={{ padding: theme.spacing.sm }}>
          <VadText variant="caption" tone="warning">Proposal creation is currently disabled for this account by runtime policy.</VadText>
        </VadCard>
      ) : null}

      <VadButton
        label="Submit for review"
        loading={working}
        disabled={!canSubmitProposal || question.trim().length < 10}
        onPress={() => void submit()}
      />
    </VadCard> : null}

    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm }}>
        <View>
          <VadText variant="heading">Your proposals</VadText>
          <VadText variant="caption" tone="secondary">Track governance state without confusing a proposal with a live market.</VadText>
        </View>
        <View style={{ borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceMuted, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}>
          <VadText variant="caption" tone="secondary">{proposals.length}</VadText>
        </View>
      </View>

      {proposals.length ? proposals.map((proposal) => <ProposalCard key={proposal.public_id} proposal={proposal} />) : (
        <VadEmptyState title="No proposals yet" body="When you submit an idea, its review state will appear here." />
      )}
    </View>
  </View>;
}

function ProposalCard({ proposal }: { proposal: ProposalRow }) {
  const theme = useVadTheme();
  const status = proposal.status.replaceAll('_', ' ');

  return <Pressable disabled>
    <VadCard variant="outlined" style={{ gap: theme.spacing.sm, borderRadius: theme.radius.xl }}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <VadText variant="bodyStrong">{proposal.question}</VadText>
          {proposal.context ? <VadText variant="caption" tone="secondary" numberOfLines={2}>{proposal.context}</VadText> : null}
        </View>
        <View style={{ borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandSoft, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}>
          <VadText variant="caption" tone="brand">{status}</VadText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <VadText variant="caption" tone="secondary">{proposal.category ?? 'Uncategorised'}</VadText>
        <VadText variant="caption" tone="tertiary">{new Date(proposal.created_at).toLocaleDateString()}</VadText>
      </View>
    </VadCard>
  </Pressable>;
}
