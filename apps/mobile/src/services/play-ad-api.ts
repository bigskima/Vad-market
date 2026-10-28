import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type PlayAdPlatform = 'WEB' | 'ANDROID' | 'IOS';

export type PlayAdPlacement = {
  id: string;
  placement_code: string;
  provider_key: string;
  ad_format: 'DIRECT_SPONSOR' | 'BANNER' | 'NATIVE' | 'INTERSTITIAL' | 'REWARDED';
  platforms: PlayAdPlatform[];
  placement_config: Record<string, unknown> | null;
  reward_points: number | null;
  opt_in_required: boolean;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
};

export function getPlayAdPlatform(): PlayAdPlatform | null {
  if (Platform.OS === 'web') return 'WEB';
  if (Platform.OS === 'android') return 'ANDROID';
  if (Platform.OS === 'ios') return 'IOS';
  return null;
}

/**
 * Loads one explicitly configured sponsor placement. Empty or disabled placements
 * remain invisible; the client cannot invent an ad, provider, reward, or campaign.
 */
export async function getActivePlaySponsorPlacement(
  placementCode: string,
  platform: PlayAdPlatform | null = getPlayAdPlatform(),
): Promise<PlayAdPlacement | null> {
  if (!platform || !placementCode.trim()) return null;

  const { data, error } = await supabase
    .from('play_ad_placements')
    .select('id, placement_code, provider_key, ad_format, platforms, placement_config, reward_points, opt_in_required, starts_at, ends_at, status')
    .eq('placement_code', placementCode)
    .eq('ad_format', 'DIRECT_SPONSOR')
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const placement = data as unknown as PlayAdPlacement;
  if (!placement.platforms?.includes(platform)) return null;
  if (placement.starts_at && Date.parse(placement.starts_at) > Date.now()) return null;
  if (placement.ends_at && Date.parse(placement.ends_at) <= Date.now()) return null;
  return placement;
}

export function getSponsorCreative(placement: PlayAdPlacement) {
  const config = placement.placement_config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;

  const creativeValue = config.creative;
  const creative = creativeValue && typeof creativeValue === 'object' && !Array.isArray(creativeValue)
    ? creativeValue as Record<string, unknown>
    : config;

  const read = (key: string, max = 240) => {
    const value = creative[key];
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
  };
  const imageUrl = read('image_url', 2000);
  const clickUrl = read('click_url', 2000);

  return {
    sponsorName: read('sponsor_name', 120),
    title: read('title', 160),
    body: read('body', 320),
    imageUrl: imageUrl.startsWith('https://') ? imageUrl : null,
    clickUrl: clickUrl.startsWith('https://') ? clickUrl : null,
    ctaLabel: read('cta_label', 48) || 'Learn more',
    imageAlt: read('image_alt', 180),
  };
}
