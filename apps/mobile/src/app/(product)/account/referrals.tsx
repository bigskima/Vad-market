import * as ExpoLinking from 'expo-linking';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, Share, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { getMyGrowthDashboard, type GrowthDashboard, type GrowthReward } from '@/services/growth-api';

export default function ReferralsScreen() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [dashboard, setDashboard] = useState<GrowthDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyGrowthDashboard();
      setDashboard(data);
    } catch (reason) {
      setError(reason instanceof Error
        ? reason.message
        : 'Your referral dashboard could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void getMyGrowthDashboard().then((data) => {
      if (active) setDashboard(data);
    }).catch((reason) => {
      if (!active) return;
      setError(reason instanceof Error
        ? reason.message
        : 'Your referral dashboard could not be loaded. Please try again.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []));

  const inviteCode = dashboard?.invite?.code?.trim() ?? '';
  const inviteUrl = useMemo(() => {
    if (!inviteCode) return '';
    const configuredBase = process.env.EXPO_PUBLIC_APP_URL?.trim().replace(/\/+$/, '');
    const query = '?ref=' + encodeURIComponent(inviteCode);
    if (configuredBase) return configuredBase + '/' + query;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.location.origin + '/' + query;
    }
    return ExpoLinking.createURL('/', { queryParams: { ref: inviteCode } });
  }, [inviteCode]);

  async function shareInvite() {
    if (!dashboard || !inviteCode || sharing) return;
    setSharing(true);
    setNotice(null);
    setError(null);
    const message = 'Join VAD Market with my invite code ' + inviteCode + '. ' + inviteUrl;
    try {
      if (
        Platform.OS === 'web'
        && typeof navigator !== 'undefined'
        && navigator.clipboard
        && typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(inviteUrl);
        setNotice('Your invite link was copied. Share it with the person you are inviting.');
      } else {
        await Share.share({ title: 'Join VAD Market', message });
        setNotice('Your invite is ready to share. Rewards depend on the active campaign terms and eligibility rules.');
      }
    } catch (reason) {
      setError(reason instanceof Error
        ? reason.message
        : 'We could not share the invite right now. You can still copy the code shown above.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <ProductSubpage title="Rewards & Referrals" maxWidth={840}>
      <View style={{ gap: density.sectionGap }}>
        <View style={{ gap: 5 }}>
          <VadText variant="caption" tone="brand">GROW WITH VAD</VadText>
          <VadText variant="title">Invite people. Track your rewards.</VadText>
          <VadText variant="body" tone="secondary">
            Your invite code, referral attribution and reward history are connected to VAD’s existing growth program.
          </VadText>
        </View>

        {loading && !dashboard ? (
          <VadCard style={{ paddingVertical: 26, alignItems: 'center', gap: 10 }}>
            <VadText variant="body" tone="secondary">Loading your referral details…</VadText>
          </VadCard>
        ) : null}

        {dashboard ? (
          <>
            <VadCard style={{ gap: 13, borderColor: dashboard.paused ? theme.colors.warning : theme.colors.brandPrimary }}>
              <View style={{ gap: 5 }}>
                <VadText variant="caption" tone={dashboard.paused ? 'warning' : 'brand'}>
                  {dashboard.paused ? 'PROGRAM STATUS · PAUSED' : dashboard.invite.rewardable ? 'REFERRALS · REWARD-ELIGIBLE' : 'REFERRALS · CODE AVAILABLE'}
                </VadText>
                <VadText variant="heading">Your invite code</VadText>
                <VadText variant="caption" tone="secondary">
                  {dashboard.invite.message || 'Share this code so new members can attribute their signup to you.'}
                </VadText>
              </View>

              <View style={{
                padding: 16,
                borderWidth: 1,
                borderColor: theme.colors.borderStrong,
                borderRadius: 13,
                backgroundColor: theme.colors.surfaceRaised,
                flexDirection: density.phone ? 'column' : 'row',
                alignItems: density.phone ? 'stretch' : 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}>
                <View style={{ gap: 4 }}>
                  <VadText variant="caption" tone="secondary">INVITE CODE</VadText>
                  <VadText variant="title" style={{ letterSpacing: 1.2 }}>{inviteCode || 'Not available'}</VadText>
                </View>
                <VadButton
                  label={sharing ? 'Preparing invite…' : 'Share invite link'}
                  onPress={() => void shareInvite()}
                  loading={sharing}
                  disabled={!inviteCode}
                  size="default"
                  fullWidth={density.phone}
                />
              </View>

              {dashboard.paused ? (
                <VadText variant="caption" tone="warning">
                  The program is paused at the moment. Keep your code; current reward eligibility is controlled by VAD’s active campaign rules.
                </VadText>
              ) : dashboard.invite.rewardable ? (
                <VadText variant="caption" tone="secondary">
                  Rewardable does not mean a reward is guaranteed. Qualifying activity, limits and payout timing follow the campaign terms.
                </VadText>
              ) : null}
            </VadCard>

            {dashboard.attribution ? (
              <VadCard style={{ gap: 7 }}>
                <VadText variant="heading">Your signup attribution</VadText>
                <VadText variant="body" tone="secondary">
                  This account was linked through code {dashboard.attribution.code}.
                </VadText>
                {dashboard.attribution.campaignName ? (
                  <InfoLine label="Campaign" value={dashboard.attribution.campaignName} />
                ) : null}
                {dashboard.attribution.partnerName ? (
                  <InfoLine label="Referrer or partner" value={dashboard.attribution.partnerName} />
                ) : null}
                <InfoLine label="Linked on" value={formatDate(dashboard.attribution.claimedAt)} />
              </VadCard>
            ) : null}

            <View style={{ gap: 9 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <VadText variant="heading">Active reward campaigns</VadText>
                <VadText variant="caption" tone="secondary">{dashboard.activeCampaigns?.length ?? 0}</VadText>
              </View>
              {(dashboard.activeCampaigns ?? []).length ? (
                dashboard.activeCampaigns.map((campaign) => (
                  <VadCard key={campaign.publicId} style={{ gap: 6 }}>
                    <VadText variant="bodyStrong">{campaign.name}</VadText>
                    {campaign.description ? (
                      <VadText variant="caption" tone="secondary">{campaign.description}</VadText>
                    ) : null}
                    {campaign.termsSummary ? (
                      <VadText variant="caption" tone="secondary">Terms: {campaign.termsSummary}</VadText>
                    ) : null}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {campaign.rewardMode ? (
                        <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 }}>
                          <VadText variant="caption">{humanize(campaign.rewardMode)}</VadText>
                        </View>
                      ) : null}
                      {campaign.rewardAssetCode ? (
                        <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 }}>
                          <VadText variant="caption">{campaign.rewardAssetCode}</VadText>
                        </View>
                      ) : null}
                    </View>
                    {campaign.endsAt ? (
                      <VadText variant="caption" tone="tertiary">Ends {formatDate(campaign.endsAt)}</VadText>
                    ) : null}
                  </VadCard>
                ))
              ) : (
                <VadCard style={{ gap: 4 }}>
                  <VadText variant="bodyStrong">No active campaigns to show</VadText>
                  <VadText variant="caption" tone="secondary">
                    Your invite details and any existing reward history will still appear here.
                  </VadText>
                </VadCard>
              )}
            </View>

            <View style={{ gap: 9 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <VadText variant="heading">Reward history</VadText>
                <VadText variant="caption" tone="secondary">{dashboard.rewards?.length ?? 0}</VadText>
              </View>
              {(dashboard.rewards ?? []).length ? (
                dashboard.rewards.map((reward) => (
                  <RewardRow key={reward.publicId} reward={reward} />
                ))
              ) : (
                <VadCard style={{ gap: 5 }}>
                  <VadText variant="bodyStrong">No rewards recorded yet</VadText>
                  <VadText variant="caption" tone="secondary">
                    When the growth program records a reward for your account, its amount and current status will appear here.
                  </VadText>
                </VadCard>
              )}
            </View>
          </>
        ) : null}

        {notice ? (
          <VadCard style={{ borderColor: theme.colors.yes }}>
            <VadText variant="caption" tone="yes">{notice}</VadText>
          </VadCard>
        ) : null}

        {error ? (
          <VadCard style={{ gap: 9, borderColor: theme.colors.danger }}>
            <VadText variant="bodyStrong" tone="danger">Referral details unavailable</VadText>
            <VadText variant="caption" tone="secondary">{error}</VadText>
            <VadButton label="Try again" variant="secondary" onPress={() => void refresh()} loading={loading} disabled={loading} />
          </VadCard>
        ) : null}

        {loading && dashboard ? (
          <VadText variant="caption" tone="secondary">Refreshing the latest program status…</VadText>
        ) : null}

        <VadText variant="caption" tone="tertiary">
          Reward eligibility, qualification rules, availability and payout status are controlled by the active VAD program. This screen reports program data; it does not promise earnings.
        </VadText>
      </View>
    </ProductSubpage>
  );
}

function RewardRow({ reward }: { reward: GrowthReward }) {
  const theme = useVadTheme();
  return (
    <VadCard style={{ gap: 7, padding: 13 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <VadText variant="bodyStrong">{reward.campaignName || 'VAD reward'}</VadText>
          <VadText variant="caption" tone="secondary">{humanize(reward.kind)} · {formatDate(reward.createdAt)}</VadText>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <VadText variant="bodyStrong">{formatRewardAmount(reward.amount, reward.assetCode)}</VadText>
          <View style={{ borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 8, paddingVertical: 3 }}>
            <VadText variant="caption">{humanize(reward.status)}</VadText>
          </View>
        </View>
      </View>
      {reward.holdUntil ? (
        <VadText variant="caption" tone="secondary">On hold until {formatDate(reward.holdUntil)}</VadText>
      ) : null}
    </VadCard>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, paddingVertical: 4 }}>
      <VadText variant="caption" tone="secondary">{label}</VadText>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <VadText variant="caption">{value}</VadText>
      </View>
    </View>
  );
}

function humanize(value: string | null | undefined) {
  if (!value) return 'Unknown';
  return value.toLowerCase().split(/[_\s-]+/).filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleDateString();
}

function formatRewardAmount(value: number | string, assetCode: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  const formatted = amount.toLocaleString('en-NG', { maximumFractionDigits: 4 });
  const asset = (assetCode || '').toUpperCase();
  if (asset === 'NGN') return '₦' + formatted;
  return formatted + (asset ? ' ' + asset : '');
}
