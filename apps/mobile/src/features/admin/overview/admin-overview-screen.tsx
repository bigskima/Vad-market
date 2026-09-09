import { router } from 'expo-router';
import { View } from 'react-native';

import { RecordList } from '@/components/ui/record-list';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export function AdminOverviewScreen({ summary, marketQueue, oracleQueue }: { summary: Record<string, number | string>; marketQueue: Record<string, unknown>[]; oracleQueue: Record<string, unknown>[] }) {
  const theme = useVadTheme();
  return <View style={{ gap: theme.spacing.lg }}>
    <View><VadText variant="title">VAD Control Plane</VadText><VadText tone="secondary">Operational controls remain permission-gated by the backend.</VadText></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>{Object.entries(summary).filter(([key]) => key !== 'generatedAt').map(([key, value]) => <VadCard key={key} variant="raised" style={{ minWidth: 130, flexGrow: 1, gap: theme.spacing.xxs }}><VadText variant="heading">{String(value)}</VadText><VadText variant="caption" tone="secondary">{key.replace(/([A-Z])/g, ' $1')}</VadText></VadCard>)}</View>
    <VadButton label="Open operations" variant="secondary" onPress={() => router.push('/admin-operations')} />
    <View style={{ gap: theme.spacing.sm }}><VadText variant="heading">Market review queue</VadText><RecordList rows={marketQueue} empty="No market proposals need review." /></View>
    <View style={{ gap: theme.spacing.sm }}><VadText variant="heading">Oracle queue</VadText><RecordList rows={oracleQueue} empty="No oracle cases need attention." /></View>
  </View>;
}
