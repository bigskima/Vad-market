import { userFacingError, type UserErrorContext } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type GrowthCampaign = {
  publicId: string;
  code: string;
  type: 'REFERRAL' | 'AFFILIATE' | 'CHALLENGE' | 'SPONSORED' | 'CREATOR' | 'SEASONAL' | 'LAUNCH' | 'EDUCATION';
  name: string;
  description: string;
  status?: string;
  rewardMode: string;
  rewardAssetCode?: string | null;
  allocatedBudget?: number;
  committedAmount?: number;
  paidAmount?: number;
  availableAmount?: number;
  fundingSource?: string;
  attributionModel?: string;
  attributionWindowDays?: number;
  rewardConfig?: Record<string, unknown>;
  qualificationRule?: Record<string, unknown>;
  eligibilityRule?: Record<string, unknown>;
  scoringRule?: Record<string, unknown>;
  winnerRule?: Record<string, unknown>;
  countryCodes?: string[];
  perUserRewardCap?: number | null;
  perUserQualificationCap?: number | null;
  heroImageUrl?: string | null;
  cardImageUrl?: string | null;
  squareImageUrl?: string | null;
  badgeText?: string | null;
  sponsorName?: string | null;
  visualConfig?: Record<string, unknown>;
  termsSummary?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt?: string;
};

export type GrowthReward = {
  publicId: string;
  campaignPublicId: string;
  campaignName: string;
  kind: string;
  assetCode: string;
  amount: number;
  status: string;
  createdAt: string;
  beneficiaryUserId?: string | null;
  beneficiaryPartnerPublicId?: string | null;
  beneficiaryPartnerName?: string | null;
  holdUntil?: string | null;
};

export type GrowthPartner = {
  publicId: string;
  type: string;
  name?: string;
  displayName: string;
  linkedUserId?: string | null;
  status: string;
  bio?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  publicMetadata?: Record<string, unknown>;
  createdAt?: string;
};

export type GrowthLink = {
  publicId: string;
  code: string;
  kind: string;
  partnerPublicId?: string | null;
  partnerName?: string | null;
  campaignPublicId?: string | null;
  campaignName?: string | null;
  rewardable: boolean;
  status: string;
  destinationPath: string;
  expiresAt?: string | null;
};

export type GrowthContract = {
  publicId: string;
  partnerPublicId: string;
  partnerName: string;
  campaignPublicId?: string | null;
  campaignName?: string | null;
  type: string;
  status: string;
  assetCode?: string | null;
  cpaAmount?: number | null;
  revenueShareBps?: number | null;
  revenueShareDays?: number | null;
  flatFee?: number | null;
  payoutCap?: number | null;
  terms?: Record<string, unknown>;
  startsAt?: string | null;
  endsAt?: string | null;
};

export type GrowthDashboard = {
  paused: boolean;
  invite: {
    code: string;
    rewardable: boolean;
    message: string;
  };
  activeCampaigns: GrowthCampaign[];
  rewards: GrowthReward[];
  attribution: null | {
    campaignName?: string | null;
    partnerName?: string | null;
    code: string;
    claimedAt: string;
  };
  partner: GrowthPartner | null;
};

export type GrowthAdminOption = { code: string; name: string };
export type GrowthAdminOptions = {
  assets: GrowthAdminOption[];
  countries: GrowthAdminOption[];
};
export type GrowthAccountSearchResult = {
  user_id: string;
  display_name: string;
  handle?: string | null;
};

export type AdminGrowthWorkspace = {
  summary: {
    activeCampaigns: number;
    partners: number;
    attributedUsers: number;
    pendingRewards: number;
    approvedLiability: number;
    paidRewards: number;
  };
  campaigns: GrowthCampaign[];
  partners: GrowthPartner[];
  contracts: GrowthContract[];
  links: GrowthLink[];
  rewardQueue: GrowthReward[];
};

function fail(
  error: { message: string; code?: string; details?: string; hint?: string } | null,
  fallback: string,
  context: UserErrorContext = 'admin',
) {
  if (error) throw userFacingError(error, context, fallback);
}

export async function getMyGrowthDashboard() {
  const [dashboardResult, stateResult] = await Promise.all([
    supabase.rpc('my_growth_dashboard'),
    supabase.rpc('my_growth_service_state'),
  ]);
  fail(dashboardResult.error, 'We could not load rewards and campaigns right now. Please try again.', 'general');
  const dashboard = dashboardResult.data as GrowthDashboard;
  if (!stateResult.error && stateResult.data && typeof stateResult.data === 'object') {
    const state = stateResult.data as { enabled?: boolean };
    dashboard.paused = state.enabled === false;
  }
  return dashboard;
}

export async function resolveGrowthCode(code: string) {
  const { data, error } = await supabase.rpc('resolve_growth_code', { p_code: code.trim() });
  fail(error, 'We could not check that code right now.', 'general');
  return data as {
    valid: boolean;
    code?: string;
    kind?: string;
    rewardable?: boolean;
    destinationPath?: string;
    campaign?: GrowthCampaign | null;
    partner?: GrowthPartner | null;
  };
}

export async function claimGrowthCode(code: string) {
  const { data, error } = await supabase.rpc('claim_growth_code', { p_code: code.trim() });
  fail(error, 'We could not apply that code to your account.', 'general');
  return data as { publicId: string; code: string; rewardable: boolean; message: string };
}

export async function joinGrowthCampaign(campaignPublicId: string) {
  const { data, error } = await supabase.rpc('join_growth_campaign', {
    p_campaign_public_id: campaignPublicId,
  });
  fail(error, 'We could not join this campaign right now.', 'general');
  return data as { joined: boolean; campaignPublicId: string; campaignName: string };
}

export async function getAdminGrowthWorkspace() {
  const { data, error } = await supabase.rpc('admin_growth_workspace');
  fail(error, 'Growth operations could not be loaded.');
  return data as AdminGrowthWorkspace;
}

export async function getAdminGrowthOptions() {
  const { data, error } = await supabase.rpc('admin_growth_options');
  fail(error, 'Campaign options could not be loaded.');
  return data as GrowthAdminOptions;
}

export async function searchGrowthAccounts(search: string) {
  const { data, error } = await supabase.rpc('admin_growth_account_search', {
    p_search: search.trim(),
  });
  fail(error, 'VAD accounts could not be searched.');
  return (data ?? []) as GrowthAccountSearchResult[];
}

export async function upsertGrowthCampaign(publicId: string | null, payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('admin_upsert_growth_campaign', {
    p_public_id: publicId,
    p_payload: payload,
  });
  fail(error, 'This campaign could not be saved.');
  return String(data);
}

export async function setGrowthCampaignStatus(publicId: string, status: string, reason: string) {
  const { data, error } = await supabase.rpc('admin_set_growth_campaign_status', {
    p_campaign_public_id: publicId,
    p_status: status,
    p_reason: reason.trim(),
  });
  fail(error, 'This campaign status could not be changed.');
  return data as { publicId: string; status: string };
}

export async function upsertGrowthPartner(publicId: string | null, payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('admin_upsert_growth_partner', {
    p_public_id: publicId,
    p_payload: payload,
  });
  fail(error, 'This partner could not be saved.');
  return String(data);
}

export async function upsertGrowthLink(publicId: string | null, payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('admin_upsert_growth_link', {
    p_public_id: publicId,
    p_payload: payload,
  });
  fail(error, 'This campaign code could not be saved.');
  return String(data);
}

export async function upsertGrowthContract(publicId: string | null, payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('admin_upsert_growth_contract', {
    p_public_id: publicId,
    p_payload: payload,
  });
  fail(error, 'These partner terms could not be saved.');
  return String(data);
}

export async function decideGrowthReward(
  publicId: string,
  decision: 'APPROVE' | 'HOLD' | 'DISQUALIFY',
  reason: string,
) {
  const { data, error } = await supabase.rpc('admin_decide_growth_reward', {
    p_reward_public_id: publicId,
    p_decision: decision,
    p_reason: reason.trim(),
  });
  fail(error, 'This reward review could not be completed.');
  return data as { publicId: string; status: string };
}

export async function uploadGrowthMedia(bytes: ArrayBuffer, mimeType: string, slot: string) {
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const safeSlot = slot.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  const path = `${safeSlot}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage.from('growth-media').upload(path, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  fail(error, 'That campaign image could not be uploaded.');
  return supabase.storage.from('growth-media').getPublicUrl(path).data.publicUrl;
}
