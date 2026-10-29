import { useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { playPracticeGame, type PlayPracticeGameReply } from '@/services/play-api';

export type PracticeGameEngineKey = 'QUICK_DRAW' | 'SPIN_AND_WIN' | 'SCRATCH_AND_REVEAL';

const wheelTokens = ['LUCK', 'PLAY', 'WOW', 'GO', 'FUN', 'NICE', 'TRY', 'AGAIN'];

export function PlayPracticeGamePanel({
  experienceId,
  engineKey,
}: {
  experienceId: string;
  engineKey: PracticeGameEngineKey;
}) {
  const theme = useVadTheme();
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<PlayPracticeGameReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rotation = useRef(new Animated.Value(0)).current;

  const isWheel = engineKey === 'SPIN_AND_WIN';
  const isScratch = engineKey === 'SCRATCH_AND_REVEAL';
  const actionLabel = isWheel ? 'Spin the wheel' : isScratch ? 'Scratch to reveal' : 'Draw a number';

  async function play() {
    if (working) return;
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      const reply = await playPracticeGame(experienceId);
      if (isWheel) {
        rotation.setValue(0);
        Animated.timing(rotation, {
          toValue: 1,
          duration: 1450,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            setResult(reply);
            setWorking(false);
          }
        });
      } else {
        setResult(reply);
        setWorking(false);
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message.toLowerCase() : '';
      setError(message.includes('sign in') || message.includes('unauthenticated')
        ? 'Sign in to your VAD account to play.'
        : 'This game could not start. Refresh and try again.');
      setWorking(false);
    }
  }

  // React Native Animated values intentionally expose an interpolation mapping during render.
  // eslint-disable-next-line react-hooks/refs
  const spinTransform = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '1800deg'],
  });

  return (
    <VadCard>
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        <View style={{ gap: 5 }}>
          <VadText variant="heading">{isWheel ? 'Lucky Wheel' : isScratch ? 'Scratch & Reveal' : 'Lucky Number Draw'}</VadText>
          <VadText tone="secondary">
            {isWheel
              ? 'Give the wheel a spin and reveal your result.'
              : isScratch
                ? 'Open the card to reveal your result.'
                : 'Draw a fresh number and see what you get.'}
          </VadText>
        </View>

        <View style={{ minHeight: 230, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.xl, backgroundColor: theme.colors.surfaceMuted, padding: theme.spacing.md }}>
          {isWheel ? (
            <View style={{ alignItems: 'center', gap: 10 }}>
              <View style={{ width: 226, height: 226, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ position: 'absolute', top: 0, zIndex: 2, width: 0, height: 0, borderLeftWidth: 11, borderRightWidth: 11, borderTopWidth: 0, borderBottomWidth: 22, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: theme.colors.brandPrimary }} />
                <Animated.View style={{ width: 202, height: 202, borderRadius: 101, borderWidth: 8, borderColor: theme.colors.brandPrimary, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: spinTransform }] }}>
                  {wheelTokens.map((token, index) => {
                    const angle = (Math.PI * 2 * index) / wheelTokens.length - Math.PI / 2;
                    const left = 101 + Math.cos(angle) * 66 - 26;
                    const top = 101 + Math.sin(angle) * 66 - 13;
                    return (
                      <View key={token} style={{ position: 'absolute', left, top, width: 52, height: 26, borderRadius: theme.radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: index % 2 === 0 ? theme.colors.brandSoft : theme.colors.surfaceMuted }}>
                        <VadText variant="caption" tone={index % 2 === 0 ? 'brand' : 'secondary'}>{token}</VadText>
                      </View>
                    );
                  })}
                  <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandPrimary }}>
                    <VadText variant="label" tone="inverse">VAD</VadText>
                  </View>
                </Animated.View>
              </View>
            </View>
          ) : isScratch ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={result ? 'Scratch card revealed' : 'Scratch to reveal your result'}
              onPress={() => { if (!working && !result) void play(); }}
              disabled={working || Boolean(result)}
              style={({ pressed }) => ({ width: '100%', minHeight: 170, borderRadius: theme.radius.xl, padding: theme.spacing.lg, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 2, borderColor: theme.colors.brandPrimary, backgroundColor: result ? theme.colors.surface : theme.colors.brandSoft, opacity: pressed ? 0.82 : 1 })}
            >
              <VadText variant="title" style={{ textAlign: 'center' }}>{result ? '✨' : '✦  ✧  ✦'}</VadText>
              <VadText variant="heading" style={{ textAlign: 'center' }}>{result ? result.result.message : working ? 'Revealing…' : 'SCRATCH TO REVEAL'}</VadText>
              <VadText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>{result ? 'Free practice result' : 'Tap the card to uncover your result'}</VadText>
            </Pressable>
          ) : (
            <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {['07', '18', '42'].map((number) => (
                  <View key={number} style={{ width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
                    <VadText variant="heading">{number}</VadText>
                  </View>
                ))}
              </View>
              <VadText tone="secondary" style={{ textAlign: 'center' }}>VAD will draw your next number.</VadText>
            </View>
          )}
        </View>

        {!(isScratch && !result) ? (
          <VadButton label={working ? (isWheel ? 'Spinning…' : isScratch ? 'Revealing…' : 'Drawing…') : result ? 'Play again' : actionLabel} onPress={() => void play()} loading={working} disabled={working} />
        ) : null}

        {error ? <VadText tone="danger">{error}</VadText> : null}

        {result && !isScratch ? (
          <View style={{ borderRadius: theme.radius.lg, padding: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, gap: 5 }}>
            <VadText variant="caption" tone="secondary">YOUR RESULT</VadText>
            <VadText variant="heading">{result.result.message}</VadText>
          </View>
        ) : null}

        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.md, gap: 3 }}>
          <VadText variant="caption" tone="secondary">Free practice · no entry fee · no cash prizes</VadText>
          <VadText variant="caption" tone="tertiary">Your result is saved in your activity history.</VadText>
        </View>
      </View>
    </VadCard>
  );
}
