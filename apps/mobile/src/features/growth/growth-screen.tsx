import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, Share, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import {
  claimGrowthCode,
  getMyGrowthDashboard,
  joinGrowthCampaign,
  type GrowthCampaign,
  type GrowthDashboard,
  type GrowthReward,
} from '@/services/growth-api';

export function GrowthScreen() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [data, setData] = useState<GrowthDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    setError(null);
    try {
      setData(await getMyGrowthDashboard());
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Rewards could not be loaded.');
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function claimCode() {
    if (!code.trim()) return;
    setWorking(true);
    setError(null);
    try {
      const result = await claimGrowthCode(code);
      setCode('');
      setMessage(result.message);
      await load(true);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'That code could not be attached.');
    } finally {
      setWorking(false);
    }
  }

  async function join(campaign: GrowthCampaign) {
    setWorking(true);
    setError(null);
    try {
      const result = await joinGrowthCampaign(campaign.publicId);
      setMessage(`You joined ${result.campaignName}. Your eligible activity can now count toward this campaign.`);
      await load(true);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'This campaign could not be joined.');
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton height={160} radius={theme.radius.xl} />
        <VadSkeleton height={110} radius={theme.radius.xl} />
        <VadSkeleton height={180} radius={theme.radius.xl} />
      </View>
    );
  }

  if (!data) {
    return <VadErrorState title="Rewards are unavailable" message={error ?? 'Please try again.'} onRetry={() => void load()} />;
  }

  const featured = data.activeCampaigns[0] ?? null;
  const otherCampaigns = data.activeCampaigns.slice(1);

  return (
    <View style={{ gap: density.sectionGap }}>
      {error ? <VadErrorState title="Something needs attention" message={error} onRetry={() => void load(true)} /> : null}
      {message ? (
        <VadCard variant="muted" style={{ borderLeftWidth: 3, borderLeftColor: theme.colors.yes, gap: 3 }}>
          <VadText variant="bodyStrong" tone="yes">Updated</VadText>
          <VadText variant="caption" tone="secondary">{message}</VadText>
        </VadCard>
      ) : null}
      {data.paused ? (
        <VadCard variant="muted" style={{ gap: 4 }}>
          <VadText variant="bodyStrong">Growth features are temporarily paused</VadText>
          <VadText variant="caption" tone="secondary">Your existing attribution and reward history remain safe while new campaign actions are paused.</VadText>
        </VadCard>
      ) : null}

      <InviteHero code={data.invite.code} message={data.invite.message} />

      {featured ? <CampaignHero campaign={featured} working={working} onJoin={join} /> : null}

      {otherCampaigns.length ? (
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ gap: 2 }}>
            <VadText variant="heading">Live opportunities</VadText>
            <VadText variant="caption" tone="secondary">Only campaigns configured and activated by VAD appear here.</VadText>
          </View>
          <View style={{ flexDirection: density.wide ? 'row' : 'column', flexWrap: 'wrap', gap: theme.spacing.md }}>
            {otherCampaigns.map((campaign) => (
              <CampaignCard key={campaign.publicId} campaign={campaign} working={working} onJoin={join} wide={density.wide} />
            ))}
          </View>
        </View>
      ) : null}

      <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
        <View style={{ gap: 3 }}>
          <VadText variant="heading">Have a campaign or partner code?</VadText>
          <VadText variant="caption" tone="secondary">Attach it once to your account. A code never guarantees money by itself; every reward still follows the campaign qualification rules.</VadText>
        </View>
        <VadInput value={code} onChangeText={(value) => setCode(value.toUpperCase())} autoCapitalize="characters" autoCorrect={false} placeholder="Enter code" />
        <VadButton label="Apply code" loading={working} disabled={!code.trim() || data.paused} onPress={() => void claimCode()} />
        {data.attribution ? (
          <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.md, gap: 2 }}>
            <VadText variant="caption" tone="secondary">CURRENT SOURCE</VadText>
            <VadText variant="bodyStrong">{data.attribution.partnerName || data.attribution.campaignName || data.attribution.code}</VadText>
            <VadText variant="caption" tone="tertiary">Code {data.attribution.code} · locked to this account</VadText>
          </View>
        ) : null}
      </VadCard>

      {data.partner ? (
        <VadCard variant="brand" style={{ gap: theme.spacing.md }}>
          {data.partner.bannerUrl ? <Image source={{ uri: data.partner.bannerUrl }} style={{ width: '100%', height: 120, borderRadius: theme.radius.lg }} resizeMode="cover" /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            {data.partner.avatarUrl ? <Image source={{ uri: data.partner.avatarUrl }} style={{ width: 56, height: 56, borderRadius: 28 }} /> : null}
            <View style={{ flex: 1, gap: 2 }}>
              <VadText variant="caption" tone="brand">PARTNER PROFILE</VadText>
              <VadText variant="heading">{data.partner.displayName}</VadText>
              <VadText variant="caption" tone="secondary">{data.partner.type.replaceAll('_', ' ')} · {data.partner.status}</VadText>
            </View>
          </View>
        </VadCard>
      ) : null}

      <View style={{ gap: theme.spacing.md }}>
        <View style={{ gap: 2 }}>
          <VadText variant="heading">Reward activity</VadText>
          <VadText variant="caption" tone="secondary">Entitlements are tracked separately from your wallet until they pass the configured hold and review rules.</VadText>
        </View>
        {data.rewards.length ? data.rewards.map((reward) => <RewardRow key={reward.publicId} reward={reward} />) : (
          <VadEmptyState title="No reward activity yet" body="Your normal invite link is for sharing VAD. Reward activity only appears when you qualify under an active promotion." />
        )}
      </View>

      <VadButton label="Refresh" variant="secondary" loading={refreshing} onPress={() => void load(true)} />
    </View>
  );
}

function InviteHero({ code, message }: { code: string; message: string }) {
  const theme = useVadTheme();
  async function shareInvite() {
    await Share.share({ message: `Join me on VAD. Use invite code ${code} when you create your account.` });
  }
  return (
    <VadCard variant="brand" style={{ gap: theme.spacing.lg, overflow: 'hidden' }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="caption" tone="brand">YOUR VAD INVITE</VadText>
        <VadText variant="display">{code}</VadText>
        <VadText variant="body" tone="secondary">Share VAD with people you know. {message}</VadText>
      </View>
      <VadButton label="Share invite" onPress={() => void shareInvite()} />
    </VadCard>
  );
}

function CampaignHero({ campaign, working, onJoin }: { campaign: GrowthCampaign; working: boolean; onJoin: (campaign: GrowthCampaign) => Promise<void> }) {
  const theme = useVadTheme();
  const joinable = ['CHALLENGE', 'SPONSORED', 'CREATOR', 'SEASONAL', 'EDUCATION'].includes(campaign.type);
  return (
    <VadCard variant="raised" style={{ padding: 0, overflow: 'hidden' }}>
      {campaign.heroImageUrl ? <Image source={{ uri: campaign.heroImageUrl }} style={{ width: '100%', height: 190 }} resizeMode="cover" /> : (
        <View style={{ height: 150, backgroundColor: theme.colors.brandSoft, justifyContent: 'flex-end', padding: theme.spacing.xl }}>
          <VadText variant="display" tone="brand">VAD</VadText>
        </View>
      )}
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
          <VadChip label={campaign.badgeText || campaign.type.replaceAll('_', ' ')} tone="brand" />
          {campaign.sponsorName ? <VadChip label={`By ${campaign.sponsorName}`} tone="neutral" /> : null}
        </View>
        <View style={{ gap: 5 }}>
          <VadText variant="title">{campaign.name}</VadText>
          <VadText variant="body" tone="secondary">{campaign.description}</VadText>
        </View>
        {joinable ? <VadButton label="Join campaign" loading={working} onPress={() => void onJoin(campaign)} /> : null}
      </View>
    </VadCard>
  );
}

function CampaignCard({ campaign, working, onJoin, wide }: { campaign: GrowthCampaign; working: boolean; onJoin: (campaign: GrowthCampaign) => Promise<void>; wide: boolean }) {
  const theme = useVadTheme();
  const joinable = ['CHALLENGE', 'SPONSORED', 'CREATOR', 'SEASONAL', 'EDUCATION'].includes(campaign.type);
  return (
    <VadCard variant="raised" style={{ width: wide ? '48%' : '100%', padding: 0, overflow: 'hidden' }}>
      {campaign.cardImageUrl ? <Image source={{ uri: campaign.cardImageUrl }} style={{ width: '100%', height: 112 }} resizeMode="cover" /> : null}
      <View style={{ padding: theme.spacing.md, gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          <VadChip label={campaign.badgeText || campaign.type.replaceAll('_', ' ')} tone="brand" />
        </View>
        <VadText variant="bodyStrong">{campaign.name}</VadText>
        <VadText variant="caption" tone="secondary">{campaign.description}</VadText>
        {joinable ? <VadButton label="Join" variant="secondary" size="small" loading={working} onPress={() => void onJoin(campaign)} /> : null}
      </View>
    </VadCard>
  );
}

function RewardRow({ reward }: { reward: GrowthReward }) {
  const theme = useVadTheme();
  const positive = ['APPROVED', 'PAYABLE', 'PAID'].includes(reward.status);
  return (
    <VadCard variant="raised" style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <VadText variant="bodyStrong">{reward.campaignName}</VadText>
        <VadText variant="caption" tone="secondary">{reward.kind.replaceAll('_', ' ')}</VadText>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <VadText variant="bodyStrong">{reward.assetCode} {Number(reward.amount).toLocaleString()}</VadText>
        <VadChip label={reward.status} tone={positive ? 'yes' : reward.status === 'DISQUALIFIED' ? 'danger' : 'warning'} />
      </View>
    </VadCard>
  );
}
