import { createElement, useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadButton } from '@/components/ui/vad-button';
import { VadText } from '@/components/ui/vad-text';
import { supabase } from '@/lib/supabase';
import { useVadTheme } from '@/providers/theme-provider';

export type AuthMode = 'signIn' | 'signUp';

type Props = {
  onContinue(mode: AuthMode): void;
};

type WelcomeSettings = {
  video_enabled: boolean;
  video_url: string | null;
  poster_url: string | null;
  headline: string;
  subheadline: string;
};

const welcomeVisual = require('../../../assets/images/vad-welcome-world.jpg');
const defaultSettings: WelcomeSettings = {
  video_enabled: false,
  video_url: null,
  poster_url: null,
  headline: 'See what the world thinks.',
  subheadline: 'Clear odds. Real-world outcomes.',
};

export function WelcomeScreen({ onContinue }: Props) {
  const theme = useVadTheme();
  const { width, height } = useWindowDimensions();
  const wide = width >= 820;
  const compact = width < 390 || height < 720;
  const [settings, setSettings] = useState<WelcomeSettings>(defaultSettings);

  useEffect(() => {
    let active = true;
    const loadSettings = async () => {
      const { data, error } = await supabase
        .from('welcome_screen_settings')
        .select('video_enabled, video_url, poster_url, headline, subheadline')
        .eq('singleton_id', 1)
        .maybeSingle();
      if (!active || error || !data) return;
      setSettings({
        video_enabled: data.video_enabled === true,
        video_url: typeof data.video_url === 'string' ? data.video_url : null,
        poster_url: typeof data.poster_url === 'string' ? data.poster_url : null,
        headline: typeof data.headline === 'string' && data.headline.trim() ? data.headline : defaultSettings.headline,
        subheadline: typeof data.subheadline === 'string' && data.subheadline.trim() ? data.subheadline : defaultSettings.subheadline,
      });
    };
    void loadSettings();
    return () => { active = false; };
  }, []);

  function cycleTheme() {
    const next = theme.preference === 'system'
      ? 'light'
      : theme.preference === 'light'
        ? 'dark'
        : 'system';
    theme.setPreference(next);
  }

  const videoUrl = settings.video_enabled && settings.video_url?.startsWith('https://')
    ? settings.video_url
    : null;
  const posterSource = settings.poster_url?.startsWith('https://')
    ? { uri: settings.poster_url }
    : welcomeVisual;

  // The browser gets a real muted, looping video element. On native builds the
  // admin-managed poster remains the safe fallback until a native video player
  // dependency is installed and available in the app bundle.
  const browserVideo = Platform.OS === 'web' && videoUrl
    ? createElement('video' as never, {
        key: videoUrl,
        autoPlay: true,
        muted: true,
        loop: true,
        playsInline: true,
        preload: 'auto',
        poster: settings.poster_url ?? undefined,
        'aria-hidden': true,
        tabIndex: -1,
        style: {
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          pointerEvents: 'none',
        },
      }, createElement('source' as never, { src: videoUrl, type: 'video/mp4' }))
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#030713' }}>
      <Image
        source={posterSource}
        resizeMode="cover"
        style={{ position: 'absolute', width: '100%', height: '100%' }}
        accessibilityLabel=""
      />
      {browserVideo}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(3, 7, 24, 0.56)',
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(18, 30, 120, 0.18)',
        }}
      />

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            alignSelf: 'center',
            width: '100%',
            maxWidth: 1240,
            paddingHorizontal: compact ? theme.spacing.md : theme.spacing.xl,
            paddingTop: compact ? theme.spacing.md : theme.spacing.lg,
            paddingBottom: compact ? theme.spacing.lg : theme.spacing.xl,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <VadLogo size={compact ? 42 : 48} />
              <View style={{ gap: 1 }}>
                <VadText variant="heading" style={{ color: '#FFFFFF' }}>VAD</VadText>
                <VadText variant="caption" style={{ color: 'rgba(235, 239, 255, 0.76)', letterSpacing: 1.5 }}>
                  MARKET
                </VadText>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Theme ${theme.preference}. Change theme`}
              onPress={cycleTheme}
              style={({ pressed }) => ({
                minHeight: 40,
                justifyContent: 'center',
                paddingHorizontal: theme.spacing.md,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.24)',
                backgroundColor: 'rgba(8, 14, 36, 0.46)',
                opacity: pressed ? 0.78 : 1,
              })}
            >
              <VadText variant="caption" style={{ color: '#FFFFFF' }}>
                {theme.preference === 'system' ? 'System' : theme.preference === 'light' ? 'Light' : 'Dark'}
              </VadText>
            </Pressable>
          </View>

          <View
            style={{
              flex: 1,
              minHeight: wide ? 610 : compact ? 420 : 500,
              flexDirection: wide ? 'row' : 'column',
              alignItems: 'stretch',
              justifyContent: 'center',
              gap: wide ? theme.spacing.xxl : theme.spacing.lg,
              paddingTop: compact ? theme.spacing.xl : theme.spacing.xxl,
              paddingBottom: theme.spacing.lg,
            }}
          >
            <View
              style={{
                flex: wide ? 1 : undefined,
                justifyContent: 'center',
                gap: compact ? theme.spacing.md : theme.spacing.lg,
                maxWidth: wide ? 600 : 680,
              }}
            >
              <View style={{ gap: theme.spacing.md }}>
                <View
                  style={{
                    alignSelf: 'flex-start',
                    borderWidth: 1,
                    borderColor: 'rgba(139, 150, 255, 0.48)',
                    borderRadius: 30,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    backgroundColor: 'rgba(66, 72, 220, 0.20)',
                  }}
                >
                  <VadText variant="caption" style={{ color: '#C8CCFF', letterSpacing: 1.1 }}>
                    PREDICT WHAT MATTERS
                  </VadText>
                </View>
                <VadText
                  variant={compact ? 'title' : 'display'}
                  style={{
                    color: '#FFFFFF',
                    fontSize: wide ? 56 : compact ? 34 : 42,
                    lineHeight: wide ? 62 : compact ? 40 : 50,
                    letterSpacing: -1.2,
                    maxWidth: 640,
                  }}
                >
                  {settings.headline}
                </VadText>
                <VadText
                  style={{
                    color: 'rgba(237, 241, 255, 0.82)',
                    fontSize: compact ? 16 : 19,
                    lineHeight: compact ? 24 : 29,
                    maxWidth: 520,
                  }}
                >
                  {settings.subheadline}
                </VadText>
              </View>

              {wide ? <WelcomeActions onContinue={onContinue} /> : null}
            </View>

            <View
              style={{
                flex: wide ? 0.85 : undefined,
                minHeight: wide ? 340 : compact ? 190 : 230,
                borderRadius: 28,
                borderWidth: 1,
                borderColor: 'rgba(151, 163, 255, 0.32)',
                backgroundColor: 'rgba(6, 12, 34, 0.26)',
                overflow: 'hidden',
                justifyContent: 'flex-end',
                padding: compact ? theme.spacing.md : theme.spacing.lg,
              }}
            >
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: -80,
                  right: -50,
                  width: 260,
                  height: 260,
                  borderRadius: 130,
                  borderWidth: 1,
                  borderColor: 'rgba(83, 105, 255, 0.42)',
                  backgroundColor: 'rgba(49, 66, 211, 0.12)',
                }}
              />
              <View style={{ gap: 6, maxWidth: 380 }}>
                <VadText variant="label" style={{ color: '#B7C1FF', letterSpacing: 1.1 }}>
                  ONE PLATFORM. REAL OUTCOMES.
                </VadText>
                <VadText variant="heading" style={{ color: '#FFFFFF', fontSize: compact ? 21 : 25, lineHeight: compact ? 27 : 32 }}>
                  Follow the signal. Make your call.
                </VadText>
                <VadText variant="caption" style={{ color: 'rgba(237, 241, 255, 0.78)', lineHeight: 20 }}>
                  Explore event markets, manage positions and track results in one place.
                </VadText>
              </View>
            </View>
          </View>

          {!wide ? <WelcomeActions onContinue={onContinue} /> : null}

          <VadText
            variant="caption"
            style={{ color: 'rgba(235, 239, 255, 0.66)', textAlign: 'center', paddingTop: theme.spacing.md }}
          >
            Some features may require identity verification and may not be available in every location.
          </VadText>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function WelcomeActions({ onContinue }: Props) {
  const theme = useVadTheme();
  return (
    <View style={{ width: '100%', maxWidth: 440, gap: theme.spacing.sm, paddingTop: theme.spacing.xs }}>
      <VadButton label="Create account" size="large" onPress={() => onContinue('signUp')} />
      <VadButton label="Sign in" size="large" variant="secondary" onPress={() => onContinue('signIn')} />
    </View>
  );
}
