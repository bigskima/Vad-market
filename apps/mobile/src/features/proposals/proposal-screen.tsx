import { useState } from 'react';
import { Alert, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { submitMarketProposal, type ProposalRow } from '@/services/market-api';

export function ProposalScreen({ proposals, canSubmitProposal, onReload }: { proposals: ProposalRow[]; canSubmitProposal: boolean; onReload: () => Promise<void> }) {
  const theme = useVadTheme();
  const [question, setQuestion] = useState('');
  const [context, setContext] = useState('');
  const [category, setCategory] = useState('Sports');
  const [working, setWorking] = useState(false);

  async function submit() {
    setWorking(true);
    try {
      await submitMarketProposal({ question, context, category });
      setQuestion(''); setContext('');
      Alert.alert('Proposal submitted', 'VAD will check duplication, clarity, oracle resolvability and governance before financial activation.');
      await onReload();
    } catch (error) { Alert.alert('Proposal not submitted', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setWorking(false); }
  }

  return <View style={{ gap: theme.spacing.lg }}>
    <View><VadText variant="title">Propose a market</VadText><VadText tone="secondary">Anyone can suggest a proposition. Financial activation remains governed.</VadText></View>
    <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
      <VadInput label="What do you think will happen?" value={question} onChangeText={setQuestion} multiline />
      <VadInput label="Context" value={context} onChangeText={setContext} multiline />
      <VadInput label="Category" value={category} onChangeText={setCategory} />
      {!canSubmitProposal ? <VadText tone="warning">Market proposals are disabled for this account by runtime policy.</VadText> : null}
      <VadButton label="Submit proposal" loading={working} disabled={!canSubmitProposal || question.trim().length < 10} onPress={() => void submit()} />
    </VadCard>
    <View style={{ gap: theme.spacing.sm }}><VadText variant="heading">Your proposals</VadText>{proposals.length ? proposals.map((proposal) => <VadCard key={proposal.public_id} style={{ gap: theme.spacing.xxs }}><VadText variant="bodyStrong">{proposal.question}</VadText><VadText variant="caption" tone="secondary">{proposal.status} · {proposal.category ?? 'Uncategorised'}</VadText></VadCard>) : <VadCard variant="outlined"><VadText tone="secondary">You have not proposed a market yet.</VadText></VadCard>}</View>
  </View>;
}
