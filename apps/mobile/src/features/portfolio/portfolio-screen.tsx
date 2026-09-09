import { View } from 'react-native';

import { RecordList } from '@/components/ui/record-list';
import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { money } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import type { OrderRow, PositionRow, WalletRow } from '@/services/market-api';

export function PortfolioScreen({ positions, orders, ngn }: { positions: PositionRow[]; orders: OrderRow[]; ngn?: WalletRow }) {
  const theme = useVadTheme();
  return <View style={{ gap: theme.spacing.lg }}>
    <View><VadText variant="title">Portfolio</VadText><VadText tone="secondary">Positions, reservations and open orders from the live ledger.</VadText></View>
    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}><Balance label="Available" value={money(ngn?.available)} /><Balance label="Reserved" value={money(ngn?.reserved)} /></View>
    <View style={{ gap: theme.spacing.sm }}><VadText variant="heading">Positions</VadText><RecordList rows={positions} empty="No positions yet." /></View>
    <View style={{ gap: theme.spacing.sm }}><VadText variant="heading">Open orders</VadText><RecordList rows={orders} empty="No open orders." /></View>
  </View>;
}

function Balance({ label, value }: { label: string; value: string }) { const theme = useVadTheme(); return <VadCard variant="raised" style={{ flex: 1, gap: theme.spacing.xxs }}><VadText variant="caption" tone="secondary">{label}</VadText><VadText variant="heading">{value}</VadText></VadCard>; }
