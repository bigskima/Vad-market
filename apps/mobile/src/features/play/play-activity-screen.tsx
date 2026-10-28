import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { listMyPlayActivity, playFriendlyError, type PlayActivity, playExperienceLabel } from '@/services/play-api';
import { PlayMessageState } from './play-states';
import { PlayActivitySkeleton } from '@/components/ui/screen-skeletons';
import { PlayTabNavigation } from './play-tab-navigation';

function formatActivityDate(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 'Date unavailable';
  return new Date(parsed).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function PlayActivityScreen() {
  const theme = useVadTheme();
  const { session } = useAuth();
  const [activity, setActivity] = useState<PlayActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setActivity(await listMyPlayActivity(session?.user.id ?? ''));
    } catch (reason) {
      setError(playFriendlyError(reason));
    } finally {
      setLoading(false);
    }
  }, [session]);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => listMyPlayActivity(session?.user.id ?? ''))
      .then((data) => {
        if (active) setActivity(data);
      })
      .catch((reason) => {
        if (active) setError(playFriendlyError(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session]);

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: 5 }}>
        <VadText variant="caption" tone="brand" style={{ letterSpacing: 1.4 }}>VAD PLAY</VadText>
        <VadText variant="title">My Play</VadText>
        <VadText tone="secondary">A private history of your confirmed Play activity.</VadText>
      </View>

      <PlayTabNavigation active="My Play" />

      {loading ? (
        <PlayActivitySkeleton />
      ) : error ? (
        <PlayMessageState title="Your history could not be loaded" body={error} actionLabel="Try again" onAction={refresh} tone="error" />
      ) : activity.length === 0 ? (
        <PlayMessageState
          title="Your Play history starts here"
          body="There is no recorded Play activity on this account yet. Only server-confirmed activity appears here; the app does not invent entries or balances."
          actionLabel="Explore VAD Play"
          onAction={() => router.replace('/play')}
        />
      ) : (
        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          {activity.map((item) => (
            <View
              key={item.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                paddingVertical: theme.spacing.md,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: theme.colors.brandSoft }}>
                <VadIcon name="activity" size={18} tone="brand" />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <VadText variant="bodyStrong" numberOfLines={1}>
                  {item.experience?.title ?? playExperienceLabel(item.activity_type)}
                </VadText>
                <VadText variant="caption" tone="secondary">
                  {playExperienceLabel(item.activity_type)} · {formatActivityDate(item.occurred_at)}
                </VadText>
                <VadText variant="caption" tone="tertiary">{item.reference ?? 'Play activity'}</VadText>
              </View>
              <View style={{ alignItems: 'flex-end', maxWidth: 110, gap: 4 }}>
                <VadText variant="caption" tone={item.status === 'COMPLETED' || item.status === 'CONFIRMED' ? 'yes' : item.status === 'FAILED' || item.status === 'VOIDED' ? 'danger' : 'secondary'}>
                  {playExperienceLabel(item.status)}
                </VadText>
                {item.amount != null && item.currency_code ? (
                  <VadText variant="caption" tone="secondary" numberOfLines={1}>
                    {item.currency_code} {Number(item.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </VadText>
                ) : null}
              </View>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => void load()}
            style={({ pressed }) => ({ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: theme.spacing.md, opacity: pressed ? 0.7 : 1 })}
          >
            <VadIcon name="activity" size={15} tone="brand" />
            <VadText variant="caption" tone="brand">Refresh history</VadText>
          </Pressable>
        </View>
      )}
    </View>
  );
}
