import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { PlayDrawAuditPanel } from './play-draw-audit-panel';
import {
  claimPlayCampaignPrize,
  listMyCampaignPrizeAwards,
  listPlayCampaignPrizes,
  type PlayCampaign,
  type PlayCampaignPrize,
  type PlayPrizeAward,
} from '@/services/play-api';
import { playMediaPublicUrl } from '@/services/play-media-api';

function money(value: number | string, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return currency + ' —';
  try { return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: currency === 'USDC' ? 4 : 2 }).format(amount); }
  catch { return currency + ' ' + amount.toLocaleString('en-NG', { maximumFractionDigits: 4 }); }
}

function rule(campaign: PlayCampaign, key: string) {
  const value = campaign.rules_public?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function statusLabel(status: string) {
  return ({
    OPEN: 'Entries open',
    FUNDING_TARGET_MET: 'Funding target reached',
    FUNDING_SHORTFALL: 'Funding shortfall',
    ENTRY_CLOSED: 'Entries closed',
    DRAW_ELIGIBLE: 'Awaiting draw',
    DRAW_AUTHORIZED: 'Draw authorized',
    DRAWN: 'Winner selected',
    SETTLED: 'Settlement recorded',
  } as Record<string, string>)[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export function PlayCampaignSummary({ campaign }: { campaign: PlayCampaign }) {
  const theme = useVadTheme();
  const [showRules, setShowRules] = useState(false);
  const [prizes, setPrizes] = useState<PlayCampaignPrize[]>([]);
  const [myAwards, setMyAwards] = useState<PlayPrizeAward[]>([]);
  const [prizeError, setPrizeError] = useState<string | null>(null);
  const [claimingAwardId, setClaimingAwardId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      listPlayCampaignPrizes(campaign.id),
      listMyCampaignPrizeAwards(campaign.id).catch(() => [] as PlayPrizeAward[]),
    ]).then(([nextPrizes, nextAwards]) => {
      if (!active) return;
      setPrizes(nextPrizes);
      setMyAwards(nextAwards);
      setPrizeError(null);
    }).catch(() => {
      if (active) setPrizeError('Prize details are temporarily unavailable.');
    });
    return () => { active = false; };
  }, [campaign.id]);

  async function claimPrize(awardId: string) {
    if (claimingAwardId) return;
    setClaimingAwardId(awardId);
    setPrizeError(null);
    try {
      await claimPlayCampaignPrize(awardId);
      setMyAwards((current) => current.map((award) => award.id === awardId
        ? { ...award, claim_status: 'CLAIMED', claimed_at: new Date().toISOString() }
        : award));
    } catch {
      setPrizeError('This prize could not be claimed. Refresh and try again.');
    } finally {
      setClaimingAwardId(null);
    }
  }
  const campaignImage = playMediaPublicUrl(rule(campaign, 'campaign_image_path'));
  const threshold = Number(campaign.funding_threshold_amount);
  const funds = Number(campaign.qualifying_funds_amount);
  const progress = Number.isFinite(threshold) && threshold > 0 && Number.isFinite(funds)
    ? Math.max(0, Math.min(100, funds / threshold * 100))
    : 0;
  const closeTime = campaign.closes_at ? Date.parse(campaign.closes_at) : NaN;
  const closeLabel = Number.isNaN(closeTime)
    ? null
    : new Date(closeTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.xl, backgroundColor: theme.colors.surface, padding: theme.spacing.md, gap: theme.spacing.md }}>
      {campaignImage ? (
        <Image source={{ uri: campaignImage }} accessibilityLabel={campaign.title + ' campaign artwork'} resizeMode="cover" style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceMuted }} />
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <VadText variant="caption" tone="brand">{statusLabel(campaign.status)}</VadText>
          <VadText variant="heading">{campaign.title}</VadText>
          <VadText tone="secondary">{campaign.prize_title}</VadText>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <VadText variant="caption" tone="secondary">Entry price</VadText>
          <VadText variant="heading">{money(campaign.entry_price_amount, campaign.currency_code)}</VadText>
        </View>
      </View>

      {prizes.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <VadText variant="heading">Prize collection</VadText>
            <VadText variant="caption" tone="secondary">{prizes.length} {prizes.length === 1 ? 'item' : 'items'}</VadText>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: 4 }}>
            {prizes.map((prize) => {
              const prizeImage = playMediaPublicUrl(prize.asset_path);
              return (
                <View key={prize.id} style={{ width: 218, overflow: 'hidden', borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceRaised }}>
                  {prizeImage ? (
                    <Image source={{ uri: prizeImage }} accessibilityLabel={prize.image_alt ?? prize.title} resizeMode="cover" style={{ width: '100%', aspectRatio: 4 / 3, backgroundColor: theme.colors.surfaceMuted }} />
                  ) : (
                    <View style={{ width: '100%', aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceMuted }}>
                      <VadIcon name="info" size={30} tone="tertiary" />
                    </View>
                  )}
                  <View style={{ padding: theme.spacing.sm, gap: 5 }}>
                    <VadText variant="label" numberOfLines={2}>{prize.title}</VadText>
                    {prize.description ? <VadText variant="caption" tone="secondary" numberOfLines={2}>{prize.description}</VadText> : null}
                    <VadText variant="caption" tone="tertiary">
                      {prize.stock_quantity.toLocaleString('en-NG')} in stock · Up to {prize.winner_limit.toLocaleString('en-NG')} {prize.winner_limit === 1 ? 'winner' : 'winners'}
                    </VadText>
                    {prize.awards_count > 0 ? (
                      <VadText variant="caption" tone="brand">
                        {prize.awards_count.toLocaleString('en-NG')} winner {prize.awards_count === 1 ? 'selected' : 'slots selected'}
                      </VadText>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {myAwards.length > 0 ? (
        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <VadText variant="heading">Your prizes</VadText>
          {myAwards.map((award) => {
            const prize = prizes.find((item) => item.id === award.prize_id);
            const stateLabel = award.claim_status === 'AWARDED' ? 'Ready to claim'
              : award.claim_status === 'CLAIMED' ? 'Claim received'
                : award.claim_status === 'FULFILLMENT_PENDING' ? 'Preparing fulfilment'
                  : award.claim_status === 'FULFILLED' ? 'Fulfilled'
                    : award.claim_status.replaceAll('_', ' ').toLowerCase();
            return (
              <View key={award.id} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 7 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <VadText variant="label">{prize?.title ?? 'Prize award'}</VadText>
                  <VadText variant="caption" tone={award.claim_status === 'FULFILLED' ? 'yes' : 'brand'}>{stateLabel}</VadText>
                </View>
                <VadText variant="caption" tone="secondary">Award #{award.award_number}</VadText>
                {award.claim_status === 'AWARDED' ? (
                  <VadButton
                    label="Claim prize"
                    onPress={() => void claimPrize(award.id)}
                    loading={claimingAwardId === award.id}
                    disabled={claimingAwardId !== null}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      {prizeError ? <VadText variant="caption" tone="warning">{prizeError}</VadText> : null}

      <View style={{ gap: 5 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <VadText variant="caption" tone="secondary">Funding</VadText>
          <VadText variant="caption" tone="secondary">{progress.toFixed(0)}%</VadText>
        </View>
        <View style={{ height: 7, borderRadius: 4, overflow: 'hidden', backgroundColor: theme.colors.surfaceMuted }}>
          <View style={{ height: '100%', width: (progress.toFixed(2) + '%') as `${number}%`, backgroundColor: theme.colors.brandPrimary }} />
        </View>
        <VadText variant="caption" tone="secondary">
          {money(campaign.qualifying_funds_amount, campaign.currency_code)} / {money(campaign.funding_threshold_amount, campaign.currency_code)}
        </VadText>
      </View>

      {closeLabel ? <VadText variant="caption" tone="secondary">Closes {closeLabel}</VadText> : null}
      {(rule(campaign, 'terms') || rule(campaign, 'refund_policy')) ? (
        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 8, gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showRules }}
            onPress={() => setShowRules((value) => !value)}
            style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
          >
            <VadText variant="label">Rules & refunds</VadText>
            <VadIcon name={showRules ? 'close' : 'chevronRight'} size={16} tone="secondary" />
          </Pressable>
          {showRules ? (
            <View style={{ gap: 9 }}>
              {rule(campaign, 'terms') ? <View style={{ gap: 3 }}><VadText variant="caption" tone="tertiary">Terms</VadText><VadText>{rule(campaign, 'terms')}</VadText></View> : null}
              {rule(campaign, 'refund_policy') ? <View style={{ gap: 3 }}><VadText variant="caption" tone="tertiary">Refund policy</VadText><VadText>{rule(campaign, 'refund_policy')}</VadText></View> : null}
            </View>
          ) : null}
        </View>
      ) : null}
      <PlayDrawAuditPanel campaignId={campaign.id} />
    </View>
  );
}
