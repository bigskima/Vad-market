import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadText } from '@/components/ui/vad-text';
import { assetMoney } from '@/features/markets/format';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { profileMediaUrl } from '@/services/profile-api';
import {
  acknowledgeWinCelebration,
  getPendingWinCelebrations,
  type WinCelebrationRow,
} from '@/services/win-result-api';

const PARTICLES = Array.from({ length: 14 }, (_, index) => ({
  index,
  x: ((index * 37) % 170) - 85,
  drift: ((index * 53) % 70) - 35,
  delay: (index % 5) * 0.08,
}));

export function WinnerCelebrationOverlay({ refreshKey = '' }: { refreshKey?: string }) {
  const { session } = useAuth();
  const theme = useVadTheme();
  const [queue, setQueue] = useState<WinCelebrationRow[]>([]);
  const acknowledged = useRef(new Set<string>()).current;
  const entrance = useRef(new Animated.Value(0)).current;
  const celebration = useRef(new Animated.Value(0)).current;
  const current = queue[0] ?? null;
  const currentKey = current ? `${current.market_id}:${current.selected_outcome}` : null;

  useEffect(() => {
    if (!session?.user.id) return;
    let cancelled = false;
    void getPendingWinCelebrations(20)
      .then((rows) => {
        if (cancelled || !rows.length) return;
        setQueue((existing) => {
          const keys = new Set(existing.map((row) => `${row.market_id}:${row.selected_outcome}`));
          const next = rows.filter((row) => !keys.has(`${row.market_id}:${row.selected_outcome}`));
          return next.length ? [...existing, ...next] : existing;
        });
      })
      .catch(() => {
        // A celebration is delight, not an auth blocker. Retry after the next product refresh/session.
      });
    return () => { cancelled = true; };
  }, [refreshKey, session?.user.id]);

  useEffect(() => {
    if (!current || !currentKey) return;
    entrance.setValue(0);
    celebration.setValue(0);
    Animated.parallel([
      Animated.spring(entrance, {
        toValue: 1,
        useNativeDriver: true,
        damping: 13,
        stiffness: 165,
        mass: 0.8,
      }),
      Animated.timing(celebration, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    if (acknowledged.has(currentKey)) return;
    const timer = setTimeout(() => {
      acknowledged.add(currentKey);
      void acknowledgeWinCelebration(current.market_id, current.selected_outcome).catch(() => {
        acknowledged.delete(currentKey);
        // If persistence fails the win may replay later, which is safer than silently losing it.
      });
    }, 650);
    return () => clearTimeout(timer);
  }, [acknowledged, celebration, current, currentKey, entrance]);

  const avatarUrl = useMemo(() => profileMediaUrl(current?.avatar_path), [current?.avatar_path]);
  if (!current) return null;

  const displayName = current.display_name?.trim() || (current.handle ? `@${current.handle}` : 'You');
  const close = () => setQueue((rows) => rows.slice(1));
  const viewWins = () => {
    close();
    router.push('/portfolio');
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: theme.spacing.lg,
          backgroundColor: 'rgba(0,0,0,0.72)',
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss win celebration"
          onPress={close}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />

        <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }}>
          {PARTICLES.map((particle) => {
            const start = particle.delay;
            const opacity = celebration.interpolate({
              inputRange: [0, start, Math.min(start + 0.12, 0.96), 1],
              outputRange: [0, 0, 1, 0],
              extrapolate: 'clamp',
            });
            const translateY = celebration.interpolate({
              inputRange: [0, 1],
              outputRange: [-60 - (particle.index % 4) * 12, 250 + (particle.index % 3) * 25],
            });
            const translateX = celebration.interpolate({
              inputRange: [0, 1],
              outputRange: [particle.x, particle.x + particle.drift],
            });
            const rotate = celebration.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', `${180 + particle.index * 35}deg`],
            });
            return (
              <Animated.View
                key={particle.index}
                style={{
                  position: 'absolute',
                  width: particle.index % 3 === 0 ? 10 : 7,
                  height: particle.index % 2 === 0 ? 16 : 10,
                  borderRadius: 3,
                  backgroundColor: particle.index % 3 === 0 ? theme.colors.yes : particle.index % 3 === 1 ? theme.colors.brandPrimary : theme.colors.warning,
                  opacity,
                  transform: [{ translateX }, { translateY }, { rotate }],
                }}
              />
            );
          })}
        </View>

        <Animated.View
          style={{
            width: '100%',
            maxWidth: 520,
            alignSelf: 'center',
            opacity: entrance,
            transform: [
              { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) },
              { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
            ],
          }}
        >
          <VadCard variant="brand" style={{ gap: theme.spacing.lg, padding: theme.spacing.xl, overflow: 'hidden' }}>
            <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
              <View
                style={{
                  width: 78,
                  height: 78,
                  borderRadius: 39,
                  overflow: 'hidden',
                  borderWidth: 3,
                  borderColor: theme.colors.yes,
                  backgroundColor: theme.colors.surfaceRaised,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
                ) : (
                  <VadText variant="title" tone="brand">{initials(displayName)}</VadText>
                )}
              </View>
              <VadChip label="PREDICTION WON" tone="yes" />
              <View style={{ alignItems: 'center', gap: 4 }}>
                <VadText variant="title" style={{ textAlign: 'center' }}>Congratulations, {displayName}!</VadText>
                <VadText tone="secondary" style={{ textAlign: 'center' }}>
                  Your prediction settled correctly. Your result and payout are now permanently recorded in Portfolio.
                </VadText>
              </View>
            </View>

            <View style={{ gap: 5 }}>
              <VadText variant="caption" tone="tertiary">WINNING MARKET</VadText>
              <VadText variant="heading" style={{ textAlign: 'center' }}>{current.market_title}</VadText>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              <WinMetric label="Your pick" value={current.selected_outcome} />
              <WinMetric label="Final result" value={current.final_outcome ?? current.selected_outcome} />
              <WinMetric label="Net payout" value={assetMoney(current.net_payout, current.asset_code)} strong />
              <WinMetric label="Profit / loss" value={signedMoney(current.realized_pnl, current.asset_code)} strong />
            </View>

            <VadText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
              Settled {new Date(current.settled_at).toLocaleString()}
            </VadText>

            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <VadButton label="View my wins" onPress={viewWins} style={{ flex: 1.4 }} />
              <VadButton label={queue.length > 1 ? `Next win · ${queue.length - 1}` : 'Close'} variant="secondary" onPress={close} style={{ flex: 1 }} />
            </View>
          </VadCard>
        </Animated.View>
      </View>
    </Modal>
  );
}

function WinMetric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: 145, minWidth: 0, gap: 2, padding: 11, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: strong ? theme.colors.yes : theme.colors.border }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant={strong ? 'heading' : 'bodyStrong'} tone={strong ? 'yes' : 'primary'} numberOfLines={1} adjustsFontSizeToFit>{value}</VadText>
    </View>
  );
}

function initials(value: string) {
  const clean = value.replace(/^@/, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : clean.slice(0, 2)).toUpperCase() || 'V';
}

function signedMoney(value: number | string, assetCode: string) {
  const numeric = Number(value ?? 0);
  return `${numeric > 0 ? '+' : ''}${assetMoney(numeric, assetCode)}`;
}
