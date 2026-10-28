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

export function WalletHomeSkeleton() {
  const theme = useVadTheme();
  return (
    <View accessibilityLabel="Loading wallet" style={{ gap: theme.spacing.lg }}>
      <HeaderShape />
      <View style={{ borderRadius: theme.radius.xxl, padding: theme.spacing.lg, gap: 12, backgroundColor: theme.colors.surfaceRaised }}>
        <VadSkeleton width="40%" height={13} />
        <VadSkeleton width="68%" height={38} radius={theme.radius.md} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <VadSkeleton width="31%" height={28} radius={theme.radius.pill} />
          <VadSkeleton width="31%" height={28} radius={theme.radius.pill} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, alignItems: 'center', gap: 8 }}><VadSkeleton width={48} height={48} radius={18} /><VadSkeleton width="75%" height={12} /></View>
        <View style={{ flex: 1, alignItems: 'center', gap: 8 }}><VadSkeleton width={48} height={48} radius={18} /><VadSkeleton width="75%" height={12} /></View>
        <View style={{ flex: 1, alignItems: 'center', gap: 8 }}><VadSkeleton width={48} height={48} radius={18} /><VadSkeleton width="75%" height={12} /></View>
      </View>
      <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.xl, padding: theme.spacing.md, gap: 10 }}>
        <VadSkeleton width="48%" height={18} />
        <VadSkeleton height={112} radius={theme.radius.lg} />
        <VadSkeleton width="55%" height={12} />
      </View>
      <View style={{ gap: 10 }}>
        <VadSkeleton width="42%" height={19} />
        {[0,1,2].map((key) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <VadSkeleton width={40} height={40} radius={14} />
            <View style={{ flex: 1, gap: 7 }}><VadSkeleton width="68%" height={13} /><VadSkeleton width="38%" height={11} /></View>
            <VadSkeleton width={78} height={14} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function MarketCatalogueSkeleton() {
  const theme = useVadTheme();
  return (
    <View accessibilityLabel="Loading market cards" style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <VadSkeleton width="21%" height={34} radius={theme.radius.pill} />
        <VadSkeleton width="24%" height={34} radius={theme.radius.pill} />
        <VadSkeleton width="22%" height={34} radius={theme.radius.pill} />
      </View>
      {[0,1,2].map((key) => (
        <View key={key} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.xl, padding: theme.spacing.md, gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <VadSkeleton width={42} height={42} radius={14} />
            <View style={{ flex: 1, gap: 7 }}><VadSkeleton width="65%" height={16} /><VadSkeleton width="34%" height={11} /></View>
            <VadSkeleton width={54} height={25} radius={theme.radius.pill} />
          </View>
          <VadSkeleton width="92%" height={17} />
          <VadSkeleton width="67%" height={12} />
          <View style={{ flexDirection: 'row', gap: 9 }}>
            <View style={{ flex: 1, gap: 6 }}><VadSkeleton height={48} radius={theme.radius.md} /><VadSkeleton width="58%" height={11} /></View>
            <View style={{ flex: 1, gap: 6 }}><VadSkeleton height={48} radius={theme.radius.md} /><VadSkeleton width="58%" height={11} /></View>
          </View>
        </View>
      ))}
    </View>
  );
}

export function PortfolioSectionSkeleton({ kind }: { kind: 'positions' | 'valuation' | 'orders' | 'history' }) {
  const theme = useVadTheme();
  if (kind === 'valuation') {
    return (
      <View accessibilityLabel="Loading position valuations" style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, gap: 7 }}><VadSkeleton width="42%" height={10} /><VadSkeleton height={32} /></View>
          <View style={{ flex: 1, gap: 7 }}><VadSkeleton width="42%" height={10} /><VadSkeleton height={32} /></View>
        </View>
      </View>
    );
  }
  const rows = kind === 'orders' ? 2 : kind === 'history' ? 4 : 3;
  return (
    <View accessibilityLabel={kind === 'positions' ? 'Loading positions' : kind === 'orders' ? 'Loading open orders' : 'Loading portfolio history'} style={{ gap: theme.spacing.sm }}>
      {[...Array(rows)].map((_, key) => (
        <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, padding: theme.spacing.md }}>
          <VadSkeleton width={38} height={38} radius={13} />
          <View style={{ flex: 1, gap: 7 }}><VadSkeleton width="66%" height={13} /><VadSkeleton width="40%" height={11} /></View>
          <View style={{ alignItems: 'flex-end', gap: 7 }}><VadSkeleton width={75} height={13} /><VadSkeleton width={48} height={10} /></View>
        </View>
      ))}
    </View>
  );
}

export function PlayActivitySkeleton() {
  const theme = useVadTheme();
  return (
    <View accessibilityLabel="Loading Play activity" style={{ gap: theme.spacing.md }}>
      <HeaderShape />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <VadSkeleton width="28%" height={34} radius={theme.radius.pill} />
        <VadSkeleton width="24%" height={34} radius={theme.radius.pill} />
        <VadSkeleton width="26%" height={34} radius={theme.radius.pill} />
      </View>
      {[0,1,2,3,4].map((key) => (
        <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: theme.spacing.md }}>
          <VadSkeleton width={40} height={40} radius={20} />
          <View style={{ flex: 1, gap: 7 }}><VadSkeleton width="63%" height={13} /><VadSkeleton width="45%" height={11} /><VadSkeleton width="32%" height={10} /></View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}><VadSkeleton width={60} height={12} /><VadSkeleton width={52} height={10} /></View>
        </View>
      ))}
    </View>
  );
}

export function AdminPlaySkeleton() {
  const theme = useVadTheme();
  return (
    <View accessibilityLabel="Loading VAD Play admin" style={{ gap: theme.spacing.lg }}>
      <HeaderShape />
      <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>
        <VadSkeleton width={90} height={34} radius={theme.radius.pill} />
        <VadSkeleton width={74} height={34} radius={theme.radius.pill} />
        <VadSkeleton width={96} height={34} radius={theme.radius.pill} />
        <VadSkeleton width={72} height={34} radius={theme.radius.pill} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[0,1,2,3].map((key) => (
          <View key={key} style={{ flexGrow: 1, minWidth: 138, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 8 }}>
            <VadSkeleton width="55%" height={11} />
            <VadSkeleton width="38%" height={25} />
            <VadSkeleton width="72%" height={10} />
          </View>
        ))}
      </View>
      <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.xl, padding: theme.spacing.md, gap: theme.spacing.md }}>
        <VadSkeleton width="52%" height={20} />
        {[0,1,2].map((key) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 }}>
            <VadSkeleton width={44} height={44} radius={14} />
            <View style={{ flex: 1, gap: 7 }}><VadSkeleton width="65%" height={13} /><VadSkeleton width="44%" height={11} /></View>
            <VadSkeleton width={74} height={28} radius={theme.radius.pill} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function HomeWatchlistSkeleton() {
  const theme = useVadTheme();
  return (
    <View accessibilityLabel="Loading watchlist" style={{ flexDirection: 'row', gap: 9 }}>
      {[0,1].map((key) => (
        <View key={key} style={{ width: 184, minHeight: 88, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 9, gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <VadSkeleton width={34} height={34} radius={12} />
            <View style={{ flex: 1, gap: 6 }}><VadSkeleton width="74%" height={12} /><VadSkeleton width="46%" height={10} /></View>
          </View>
          <VadSkeleton width="58%" height={10} />
        </View>
      ))}
    </View>
  );
}

export function AssistantConversationSkeleton() {
  const theme = useVadTheme();
  return (
    <View accessibilityLabel="Loading conversation" style={{ gap: theme.spacing.md, paddingVertical: theme.spacing.sm }}>
      <View style={{ alignSelf: 'flex-end', width: '70%', borderRadius: theme.radius.xl, padding: theme.spacing.md, gap: 7, backgroundColor: theme.colors.surfaceMuted }}>
        <VadSkeleton width="90%" height={12} />
        <VadSkeleton width="55%" height={12} />
      </View>
      <View style={{ alignSelf: 'flex-start', width: '86%', borderRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md, gap: 7 }}>
        <VadSkeleton width="82%" height={12} />
        <VadSkeleton width="94%" height={12} />
        <VadSkeleton width="71%" height={12} />
      </View>
      <View style={{ alignSelf: 'flex-end', width: '56%', borderRadius: theme.radius.xl, padding: theme.spacing.md, gap: 7, backgroundColor: theme.colors.surfaceMuted }}>
        <VadSkeleton width="88%" height={12} />
      </View>
    </View>
  );
}

export function AssistantThreadsSkeleton() {
  const theme = useVadTheme();
  return (
    <View accessibilityLabel="Loading conversation history" style={{ gap: theme.spacing.sm }}>
      {[0,1,2,3].map((key) => (
        <View key={key} style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <VadSkeleton width={34} height={34} radius={12} />
          <View style={{ flex: 1, gap: 7 }}><VadSkeleton width="70%" height={13} /><VadSkeleton width="42%" height={10} /></View>
          <VadSkeleton width={18} height={18} radius={9} />
        </View>
      ))}
    </View>
  );
}
