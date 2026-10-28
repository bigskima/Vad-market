import { View } from 'react-native';

import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';

function HeaderShape() {
  const theme = useVadTheme();
  return (
    <View style={{ gap: 8 }}>
      <VadSkeleton width="32%" height={12} />
      <VadSkeleton width="72%" height={30} radius={theme.radius.md} />
      <VadSkeleton width="54%" height={14} />
    </View>
  );
}

function CardLines({ image = false }: { image?: boolean }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexGrow: 1, minWidth: 138, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.xl, backgroundColor: theme.colors.surface }}>
      {image ? <VadSkeleton height={118} radius={theme.radius.lg} /> : null}
      <View style={{ padding: theme.spacing.md, gap: 8 }}>
        <VadSkeleton width="42%" height={10} />
        <VadSkeleton width="82%" height={17} />
        <VadSkeleton width="62%" height={12} />
        <VadSkeleton height={8} radius={theme.radius.pill} />
      </View>
    </View>
  );
}

export function PlayHubSkeleton() {
  const theme = useVadTheme();
  return (
    <View accessibilityLabel="Loading Play home" style={{ gap: theme.spacing.lg }}>
      <HeaderShape />
      <VadSkeleton height={196} radius={theme.radius.xxl} />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <VadSkeleton width="24%" height={34} radius={theme.radius.pill} />
        <VadSkeleton width="22%" height={34} radius={theme.radius.pill} />
        <VadSkeleton width="27%" height={34} radius={theme.radius.pill} />
      </View>
      <View style={{ gap: theme.spacing.sm }}>
        <VadSkeleton width="48%" height={20} />
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <CardLines image />
          <CardLines image />
        </View>
      </View>
    </View>
  );
}

export function PlayGamesSkeleton() {
  const theme = useVadTheme();
  return (
    <View accessibilityLabel="Loading games catalogue" style={{ gap: theme.spacing.lg }}>
      <HeaderShape />
      <VadSkeleton height={48} radius={theme.radius.lg} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <VadSkeleton width="22%" height={34} radius={theme.radius.pill} />
        <VadSkeleton width="22%" height={34} radius={theme.radius.pill} />
        <VadSkeleton width="22%" height={34} radius={theme.radius.pill} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        <CardLines image />
        <CardLines image />
        <CardLines image />
        <CardLines image />
      </View>
    </View>
  );
}

export function PlayExperienceDetailSkeleton() {
  const theme = useVadTheme();
  return (
    <View accessibilityLabel="Loading game details" style={{ gap: theme.spacing.lg }}>
      <VadSkeleton width="24%" height={18} />
      <VadSkeleton height={208} radius={theme.radius.xxl} />
      <HeaderShape />
      <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.xl, padding: theme.spacing.md, gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, gap: 8 }}><VadSkeleton width="45%" height={12} /><VadSkeleton width="85%" height={20} /></View>
          <View style={{ alignItems: 'flex-end', gap: 8 }}><VadSkeleton width={68} height={11} /><VadSkeleton width={94} height={20} /></View>
        </View>
        <VadSkeleton height={8} radius={theme.radius.pill} />
        <VadSkeleton width="65%" height={12} />
      </View>
    </View>
  );
}

export function MarketDetailSkeleton() {
  const theme = useVadTheme();
  const density = useProductDensity();
  return (
    <View accessibilityLabel="Loading market details" style={{ gap: density.phone ? 12 : theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>
        <VadSkeleton width={68} height={27} radius={theme.radius.pill} />
        <VadSkeleton width={76} height={27} radius={theme.radius.pill} />
        <VadSkeleton width={88} height={27} radius={theme.radius.pill} />
      </View>
      <VadSkeleton height={density.phone ? 170 : 220} radius={theme.radius.xl} />
      <VadSkeleton height={50} radius={theme.radius.lg} />
      <View style={{ flexDirection: 'row', gap: 7 }}>
        <VadSkeleton width={82} height={37} radius={theme.radius.pill} />
        <VadSkeleton width={66} height={37} radius={theme.radius.pill} />
        <VadSkeleton width={88} height={37} radius={theme.radius.pill} />
        <VadSkeleton width={64} height={37} radius={theme.radius.pill} />
      </View>
      <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.xl, padding: theme.spacing.md, gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <View style={{ flex: 1, gap: 8 }}><VadSkeleton width="42%" height={12} /><VadSkeleton height={43} radius={theme.radius.md} /></View>
          <View style={{ flex: 1, gap: 8 }}><VadSkeleton width="42%" height={12} /><VadSkeleton height={43} radius={theme.radius.md} /></View>
        </View>
        <VadSkeleton width="38%" height={18} />
        <VadSkeleton height={112} radius={theme.radius.lg} />
      </View>
    </View>
  );
}

export function WalletLedgerSkeleton() {
  const theme = useVadTheme();
  return (
    <View accessibilityLabel="Loading wallet ledger" style={{ gap: theme.spacing.md }}>
      <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.xl, padding: theme.spacing.md, gap: 8 }}>
        <VadSkeleton width="38%" height={12} />
        <VadSkeleton width="64%" height={24} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <VadSkeleton height={32} radius={theme.radius.md} />
          <VadSkeleton height={32} radius={theme.radius.md} />
          <VadSkeleton height={32} radius={theme.radius.md} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 7 }}>
        <VadSkeleton width="20%" height={34} radius={theme.radius.pill} />
        <VadSkeleton width="25%" height={34} radius={theme.radius.pill} />
        <VadSkeleton width="22%" height={34} radius={theme.radius.pill} />
      </View>
      {[0, 1, 2, 3, 4].map((key) => (
        <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
          <VadSkeleton width={42} height={42} radius={14} />
          <View style={{ flex: 1, gap: 7 }}><VadSkeleton width="64%" height={13} /><VadSkeleton width="38%" height={11} /></View>
          <View style={{ alignItems: 'flex-end', gap: 7 }}><VadSkeleton width={76} height={14} /><VadSkeleton width={52} height={10} /></View>
        </View>
      ))}
    </View>
  );
}

export function PaymentActivitySkeleton() {
  const theme = useVadTheme();
  return (
    <View accessibilityLabel="Loading deposits and withdrawals" style={{ gap: theme.spacing.md }}>
      <HeaderShape />
      <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.xl, padding: theme.spacing.md, gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, gap: 7 }}><VadSkeleton width="44%" height={11} /><VadSkeleton width="75%" height={21} /></View>
          <View style={{ flex: 1, gap: 7 }}><VadSkeleton width="44%" height={11} /><VadSkeleton width="75%" height={21} /></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 7 }}>
          <VadSkeleton width="20%" height={28} radius={theme.radius.pill} />
          <VadSkeleton width="23%" height={28} radius={theme.radius.pill} />
          <VadSkeleton width="27%" height={28} radius={theme.radius.pill} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 7 }}>
        <VadSkeleton width="22%" height={35} radius={theme.radius.pill} />
        <VadSkeleton width="28%" height={35} radius={theme.radius.pill} />
        <VadSkeleton width="28%" height={35} radius={theme.radius.pill} />
      </View>
      {[0, 1, 2, 3].map((key) => (
        <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, padding: theme.spacing.md }}>
          <VadSkeleton width={38} height={38} radius={13} />
          <View style={{ flex: 1, gap: 7 }}><VadSkeleton width="60%" height={13} /><VadSkeleton width="36%" height={11} /></View>
          <View style={{ alignItems: 'flex-end', gap: 7 }}><VadSkeleton width={84} height={14} /><VadSkeleton width={58} height={10} /></View>
        </View>
      ))}
    </View>
  );
}
