import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { playPracticeGame, type PlayPracticeGameReply } from '@/services/play-api';

export type PracticeGameEngineKey = 'QUICK_DRAW' | 'SPIN_AND_WIN' | 'SCRATCH_AND_REVEAL';

type WheelToken = { label: string; outcomeCode: string };

// Segment counts mirror the server's weighted outcomes. The server still decides the result.
const wheelTokens: WheelToken[] = [
  { label: 'TRY', outcomeCode: 'TRY_AGAIN' },
  { label: 'TRY', outcomeCode: 'TRY_AGAIN' },
  { label: 'TRY', outcomeCode: 'TRY_AGAIN' },
  { label: 'TRY', outcomeCode: 'TRY_AGAIN' },
  { label: 'NICE', outcomeCode: 'NICE_SPIN' },
  { label: 'NICE', outcomeCode: 'NICE_SPIN' },
  { label: 'NICE', outcomeCode: 'NICE_SPIN' },
  { label: 'LUCK', outcomeCode: 'LUCKY_MOMENT' },
  { label: 'LUCK', outcomeCode: 'LUCKY_MOMENT' },
  { label: 'GREAT', outcomeCode: 'GREAT_VIBES' },
];

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
  const [scratchProgress, setScratchProgress] = useState(0);
  const [scratchHint, setScratchHint] = useState<string | null>(null);
  const rotation = useRef(new Animated.Value(0)).current;
  const scratchDistance = useRef(0);
  const scratchPoint = useRef<{ x: number; y: number } | null>(null);
  const scratchEnabled = useRef(false);
  const latestPlay = useRef<() => void>(() => undefined);

  const isWheel = engineKey === 'SPIN_AND_WIN';
  const isScratch = engineKey === 'SCRATCH_AND_REVEAL';
  const actionLabel = isWheel ? 'Spin the wheel' : isScratch ? 'Scratch to reveal' : 'Draw a number';

  const scratchResponder = useMemo(() => {
    // PanResponder stores these callbacks and invokes them from touch events, not during render.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponder: () => scratchEnabled.current,
      onMoveShouldSetPanResponder: () => scratchEnabled.current,
      onPanResponderGrant: (event) => {
        scratchDistance.current = 0;
        scratchPoint.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
        setScratchProgress(0);
        setScratchHint(null);
      },
      onPanResponderMove: (event) => {
        const nextPoint = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
        const previousPoint = scratchPoint.current;
        if (previousPoint) {
          scratchDistance.current += Math.hypot(
            nextPoint.x - previousPoint.x,
            nextPoint.y - previousPoint.y,
          );
        }
        scratchPoint.current = nextPoint;
        setScratchProgress(Math.min(100, Math.round((scratchDistance.current / 170) * 100)));
      },
      onPanResponderRelease: () => {
        scratchPoint.current = null;
        if (scratchDistance.current >= 170) {
          setScratchProgress(100);
          setScratchHint(null);
          latestPlay.current();
        } else if (scratchDistance.current > 0) {
          setScratchHint('Keep scratching across the card to reveal your result.');
        }
      },
      onPanResponderTerminate: () => {
        scratchPoint.current = null;
      },
      onPanResponderTerminationRequest: () => false,
    });
  }, []);

  const play = useCallback(async () => {
    if (working) return;
    setWorking(true);
    setError(null);
    setScratchHint(null);
    setResult(null);
    try {
      const reply = await playPracticeGame(experienceId);
      if (isWheel) {
        const matchingIndices = wheelTokens.reduce<number[]>((matches, token, index) => {
          if (token.outcomeCode === reply.result.outcomeCode) matches.push(index);
          return matches;
        }, []);
        const selectedIndex = matchingIndices[0] ?? 0;
        // Five full turns, then stop with the server-selected outcome beneath the pointer.
        const landingOffset = (360 - (selectedIndex * 360) / wheelTokens.length) % 360;
        rotation.setValue(0);
        Animated.timing(rotation, {
          toValue: 1800 + landingOffset,
          duration: 2300,
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
  }, [experienceId, isWheel, rotation, working]);

  useEffect(() => {
    latestPlay.current = () => { void play(); };
    scratchEnabled.current = isScratch && !working && !result;
  }, [isScratch, play, result, working]);

  function resetScratchCard() {
    setResult(null);
    setError(null);
    setScratchProgress(0);
    setScratchHint(null);
    scratchDistance.current = 0;
  }

  // This value represents degrees; interpolation keeps the native-driver rotation smooth.
  // eslint-disable-next-line react-hooks/refs
  const spinTransform = rotation.interpolate({
    inputRange: [0, 3600],
    outputRange: ['0deg', '3600deg'],
    extrapolate: 'clamp',
  });
  const drawnNumber = result?.result.outcomeCode.match(/^NUMBER_(\d{2})$/)?.[1] ?? null;

  return (
    <VadCard>
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        <View style={{ gap: 5 }}>
          <VadText variant="heading">{isWheel ? 'Lucky Wheel' : isScratch ? 'Scratch & Reveal' : 'Lucky Number Draw'}</VadText>
          <VadText tone="secondary">
            {isWheel
              ? 'Spin the wheel. It stops on your result.'
              : isScratch
                ? 'Scratch across the card to uncover your result.'
                : 'Draw a number and see what you get.'}
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
                    const left = 101 + Math.cos(angle) * 66 - 21;
                    const top = 101 + Math.sin(angle) * 66 - 11;
                    return (
                      <View key={token.outcomeCode + '-' + index} style={{ position: 'absolute', left, top, width: 42, height: 22, borderRadius: theme.radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: index % 2 === 0 ? theme.colors.brandSoft : theme.colors.surfaceMuted }}>
                        <VadText variant="caption" tone={index % 2 === 0 ? 'brand' : 'secondary'}>{token.label}</VadText>
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
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel={result ? 'Scratch card revealed' : 'Scratch across the card to reveal your result'}
              // eslint-disable-next-line react-hooks/refs
              {...scratchResponder.panHandlers}
              style={{
                width: '100%',
                minHeight: 170,
                borderRadius: theme.radius.xl,
                padding: theme.spacing.lg,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderWidth: 2,
                borderColor: theme.colors.brandPrimary,
                backgroundColor: result || scratchProgress >= 65
                  ? theme.colors.surface
                  : scratchProgress >= 30
                    ? theme.colors.surfaceMuted
                    : theme.colors.brandSoft,
              }}
            >
              {!result ? Array.from({ length: Math.min(8, Math.floor(scratchProgress / 12)) }, (_, index) => (
                <View key={index} pointerEvents="none" style={{ position: 'absolute', left: (index * 13 + 7) % 84, top: (index * 29 + 10) % 75 }}>
                  <VadText variant="caption" tone="secondary">✦</VadText>
                </View>
              )) : null}
              <VadText variant="title" style={{ textAlign: 'center' }}>{result ? '✨' : '✦  ✧  ✦'}</VadText>
              <VadText variant="heading" style={{ textAlign: 'center' }}>
                {result ? result.result.message : working ? 'Revealing…' : scratchProgress > 0 ? 'Keep scratching…' : 'SCRATCH TO REVEAL'}
              </VadText>
              <VadText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
                {result ? 'Free practice result' : scratchProgress > 0 ? scratchHint ?? 'Keep moving your finger across the card.' : 'Drag your finger across the card'}
              </VadText>
              {!result ? (
                <View style={{ height: 5, width: '100%', borderRadius: theme.radius.pill, overflow: 'hidden', backgroundColor: theme.colors.surface, marginTop: 4 }}>
                  <View style={{ height: '100%', width: Math.round(scratchProgress * 2.4), backgroundColor: theme.colors.brandPrimary }} />
                </View>
              ) : null}
            </View>
          ) : (
            <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
              <View style={{ width: 106, height: 106, borderRadius: 53, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, borderWidth: 3, borderColor: theme.colors.brandPrimary }}>
                <VadText variant="title">{drawnNumber ?? '??'}</VadText>
              </View>
              <VadText tone="secondary" style={{ textAlign: 'center' }}>
                {drawnNumber ? 'Your drawn number' : 'Tap draw to reveal a number'}
              </VadText>
            </View>
          )}
        </View>

        {!(isScratch && !result) ? (
          <VadButton
            label={isScratch && result ? 'New card' : working ? (isWheel ? 'Spinning…' : isScratch ? 'Revealing…' : 'Drawing…') : result ? 'Play again' : actionLabel}
            onPress={() => {
              if (isScratch && result) resetScratchCard();
              else void play();
            }}
            loading={working}
            disabled={working}
          />
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
