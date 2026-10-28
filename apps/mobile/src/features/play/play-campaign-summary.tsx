import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { PlayDrawAuditPanel } from './play-draw-audit-panel';
import type { PlayCampaign } from '@/services/play-api';
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
