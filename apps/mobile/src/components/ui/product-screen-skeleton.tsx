import { View } from 'react-native';
import type { ReactNode } from 'react';

import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { useVadTheme } from '@/providers/theme-provider';

export type ProductSkeletonVariant =
  | 'home'
  | 'markets'
  | 'marketDetail'
  | 'wallet'
  | 'portfolio'
  | 'account'
  | 'watchlist'
  | 'news'
  | 'playHub'
  | 'playGames'
  | 'playDetail'
  | 'playActivity';

function Line({ width = '100%', height = 14, radius }: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
}) {
  return <VadSkeleton width={width} height={height} radius={radius} />;
}

function PillRow({ widths = ['24%', '30%', '20%', '26%'] }: { widths?: (number | `${number}%`)[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {widths.map((width, index) => <Line key={index} width={width} height={34} radius={999} />)}
    </View>
  );
}

function MarketCard({ detailed = false }: { detailed?: boolean }) {
  const theme = useVadTheme();
  return (
    <View style={{ gap: 12, padding: 14, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.xl, backgroundColor: theme.colors.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Line width={44} height={44} radius={12} />
        <View style={{ flex: 1, gap: 7 }}>
          <Line width="45%" height={10} />
          <Line width="78%" height={16} />
        </View>
        <Line width={62} height={26} radius={999} />
      </View>
      {detailed ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, gap: 8, padding: 12, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceMuted }}>
              <Line width="52%" height={10} /><Line width="76%" height={22} />
            </View>
            <View style={{ flex: 1, gap: 8, padding: 12, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceMuted }}>
              <Line width="52%" height={10} /><Line width="76%" height={22} />
            </View>
          </View>
          <Line height={9} radius={5} />
        </>
      ) : null}
    </View>
  );
}

function ActivityRows({ count = 4 }: { count?: number }) {
  return (
    <View style={{ gap: 14 }}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 }}>
          <Line width={40} height={40} radius={12} />
          <View style={{ flex: 1, gap: 7 }}>
            <Line width="58%" height={14} />
            <Line width="35%" height={10} />
          </View>
          <View style={{ alignItems: 'flex-end', gap: 7, width: 82 }}>
            <Line width="90%" height={14} />
            <Line width="65%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function HomeWatchlistSkeleton({ count = 3 }: { count?: number }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 9 }}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={{ width: 154, minHeight: 84, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 9, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <VadSkeleton width={34} height={34} radius={10} />
            <View style={{ flex: 1, gap: 5 }}><VadSkeleton width="92%" height={10} /><VadSkeleton width="62%" height={8} /></View>
          </View>
          <VadSkeleton width="54%" height={8} />
        </View>
      ))}
    </View>
  );
}

export function WatchlistRowsSkeleton({ count = 4 }: { count?: number }) {
  const theme = useVadTheme();
  return (
    <View style={{ gap: 8 }}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 15, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
          <VadSkeleton width={48} height={48} radius={13} />
          <View style={{ flex: 1, minWidth: 0, gap: 7 }}><VadSkeleton width="82%" height={13} /><VadSkeleton width="56%" height={10} /></View>
          <VadSkeleton width={24} height={24} radius={12} />
        </View>
      ))}
    </View>
  );
}

export function NewsStoryCardsSkeleton({ count = 3, columns = 1 }: { count?: number; columns?: 1 | 2 }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexDirection: columns === 2 ? 'row' : 'column', flexWrap: columns === 2 ? 'wrap' : 'nowrap', gap: theme.spacing.md }}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={{ width: columns === 2 ? '48%' : '100%', flexGrow: columns === 2 ? 1 : 0, minWidth: 0, gap: 10, paddingBottom: 14 }}>
          <VadSkeleton height={170} radius={theme.radius.lg} />
          <View style={{ gap: 7, paddingHorizontal: 2 }}>
            <VadSkeleton width="32%" height={9} />
            <VadSkeleton width="92%" height={17} />
            <VadSkeleton width="73%" height={17} />
            <VadSkeleton width="86%" height={11} />
            <VadSkeleton width="57%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function MarketOutcomeChoicesSkeleton() {
  const theme = useVadTheme();
  return (
    <View style={{ gap: 10 }}>
      {[0, 1, 2].map((index) => (
        <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
          <VadSkeleton width={38} height={38} radius={11} />
          <View style={{ flex: 1, gap: 7 }}><VadSkeleton width="58%" height={13} /><VadSkeleton width="34%" height={10} /></View>
          <View style={{ alignItems: 'flex-end', gap: 6, width: 74 }}><VadSkeleton width="86%" height={14} /><VadSkeleton width="60%" height={9} /></View>
        </View>
      ))}
    </View>
  );
}

export function PortfolioSectionSkeleton({ kind }: { kind: 'positions' | 'orders' | 'history' }) {
  const theme = useVadTheme();
  const count = kind === 'history' ? 4 : 3;
  return (
    <View style={{ gap: 9 }}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={{ gap: 10, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <VadSkeleton width={38} height={38} radius={11} />
            <View style={{ flex: 1, gap: 6 }}><VadSkeleton width="62%" height={13} /><VadSkeleton width="40%" height={9} /></View>
            <View style={{ width: 76, alignItems: 'flex-end', gap: 6 }}><VadSkeleton width="90%" height={13} /><VadSkeleton width="59%" height={9} /></View>
          </View>
          {kind === 'positions' ? <View style={{ flexDirection: 'row', gap: 7 }}><VadSkeleton height={31} radius={10} /><VadSkeleton height={31} radius={10} /><VadSkeleton height={31} radius={10} /></View> : null}
          {kind === 'orders' ? <View style={{ flexDirection: 'row', gap: 8 }}><VadSkeleton width="28%" height={23} radius={999} /><VadSkeleton width="35%" height={23} radius={999} /></View> : null}
          {kind === 'history' ? <VadSkeleton width="69%" height={10} /> : null}
        </View>
      ))}
    </View>
  );
}

export function ProductScreenSkeleton({ variant }: { variant: ProductSkeletonVariant }) {
  const theme = useVadTheme();
  const panel = (children: ReactNode, height?: number) => (
    <View style={{ gap: 12, padding: 14, borderRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, minHeight: height }}>
      {children}
    </View>
  );

  if (variant === 'home') {
    return (
      <View style={{ gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 8 }}><Line width="32%" height={10} /><Line width="68%" height={24} /></View>
          <Line width={40} height={40} radius={20} />
        </View>
        {panel(<><Line width="32%" height={11} /><Line width="76%" height={24} /><Line width="56%" height={12} /><Line height={46} radius={14} /></>, 170)}
        <PillRow widths={['22%', '27%', '24%', '20%']} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {panel(<><Line height={100} radius={12} /><Line width="65%" /><Line width="85%" /></>, 170)}
          {panel(<><Line height={100} radius={12} /><Line width="65%" /><Line width="85%" /></>, 170)}
        </View>
      </View>
    );
  }

  if (variant === 'markets' || variant === 'watchlist' || variant === 'news') {
    return (
      <View style={{ gap: 16 }}>
        <View style={{ gap: 7 }}><Line width="40%" height={26} /><Line width="64%" height={12} /></View>
        {variant === 'markets' ? <Line height={46} radius={14} /> : null}
        <PillRow />
        <View style={{ gap: 10 }}>
          <MarketCard /><MarketCard /><MarketCard />
        </View>
      </View>
    );
  }

  if (variant === 'marketDetail') {
    return (
      <View style={{ gap: 15 }}>
        {panel(<><Line width="24%" height={11} /><Line width="78%" height={25} /><Line width="42%" height={12} /><Line height={200} radius={16} /></>, 300)}
        <Line height={48} radius={12} />
        <PillRow widths={['22%', '17%', '23%', '16%', '17%']} />
        <MarketCard detailed />
        <MarketCard />
      </View>
    );
  }

  if (variant === 'wallet') {
    return (
      <View style={{ gap: 18 }}>
        {panel(<><Line width="35%" height={11} /><Line width="64%" height={32} /><View style={{ flexDirection: 'row', gap: 8 }}><Line height={42} radius={12} /><Line height={42} radius={12} /></View></>, 148)}
        <View style={{ flexDirection: 'row', gap: 8 }}><Line height={46} radius={12} /><Line height={46} radius={12} /><Line height={46} radius={12} /></View>
        <PillRow widths={['25%', '28%', '26%']} />
        {panel(<ActivityRows count={4} />)}
      </View>
    );
  }

  if (variant === 'portfolio') {
    return (
      <View style={{ gap: 16 }}>
        {panel(<><Line width="35%" height={11} /><Line width="66%" height={30} /><Line height={110} radius={14} /></>, 190)}
        <View style={{ flexDirection: 'row', gap: 8 }}>{panel(<><Line width="55%" /><Line width="78%" height={20} /></>)}{panel(<><Line width="55%" /><Line width="78%" height={20} /></>)}</View>
        {panel(<ActivityRows count={3} />)}
      </View>
    );
  }

  if (variant === 'account') {
    return (
      <View style={{ gap: 16 }}>
        {panel(<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Line width={62} height={62} radius={31} /><View style={{ flex: 1, gap: 8 }}><Line width="42%" /><Line width="76%" height={20} /></View></View>)}
        {panel(<View style={{ gap: 18 }}>{Array.from({ length: 5 }, (_, index) => <View key={index} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Line width={35} height={35} radius={10} /><View style={{ flex: 1, gap: 6 }}><Line width="43%" /><Line width="65%" height={10} /></View><Line width={16} height={16} radius={8} /></View>)}</View>)}
      </View>
    );
  }

  if (variant === 'playHub') {
    return (
      <View style={{ gap: 18 }}>
        <View style={{ gap: 7 }}><Line width="22%" height={10} /><Line width="63%" height={25} /><Line width="57%" height={12} /></View>
        <Line height={210} radius={theme.radius.xxl} />
        <PillRow widths={['25%', '32%', '23%']} />
        <View style={{ gap: 10 }}><Line width="41%" height={18} /><View style={{ flexDirection: 'row', gap: 10 }}>{panel(<><Line height={100} radius={12} /><Line width="70%" /><Line width="90%" /></>, 165)}{panel(<><Line height={100} radius={12} /><Line width="70%" /><Line width="90%" /></>, 165)}</View></View>
      </View>
    );
  }

  if (variant === 'playGames') {
    return (
      <View style={{ gap: 16 }}>
        <View style={{ gap: 7 }}><Line width="38%" height={26} /><Line width="52%" height={12} /></View>
        <Line height={44} radius={14} />
        <PillRow />
        {panel(<ActivityRows count={5} />)}
      </View>
    );
  }

  if (variant === 'playActivity') {
    return (
      <View style={{ gap: 16 }}>
        <View style={{ gap: 7 }}><Line width="43%" height={24} /><Line width="59%" height={12} /></View>
        <PillRow widths={['22%', '25%', '25%']} />
        {panel(<ActivityRows count={5} />)}
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <Line width="34%" height={14} />
      <Line height={210} radius={theme.radius.xxl} />
      <View style={{ gap: 8 }}><Line width="60%" height={24} /><Line width="84%" height={12} /><Line width="72%" height={12} /></View>
      {panel(<><Line width="60%" height={17} /><Line height={10} /><Line height={10} /><Line height={10} /></>)}
    </View>
  );
}
