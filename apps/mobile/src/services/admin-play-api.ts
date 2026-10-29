import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type PlayAdminEngine = {
  engine_key: string;
  engine_family: string;
  display_name: string;
  description: string | null;
  rollout_status: string;
  runtime_ready: boolean;
  supported_platforms: string[];
  requires_legal_review: boolean;
  created_at: string;
  updated_at: string;
};

export type PlayAdminExperience = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  experience_type: string;
  engine_key: string;
  status: string;
  hero_asset_url: string | null;
  card_asset_url: string | null;
  image_alt: string | null;
  display_order: number;
  public_config: Record<string, unknown> | null;
  engine_config: Record<string, unknown> | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlayAdminCampaign = {
  id: string;
  experience_id: string;
  slug: string;
  title: string;
  prize_title: string;
  currency_code: string;
  prize_cost_amount: number | string;
  profit_target_mode: 'PERCENT_OF_PRIZE' | 'FIXED_AMOUNT';
  profit_target_value: number | string;
  campaign_cost_budget_amount: number | string;
  funding_threshold_amount: number | string;
  qualifying_funds_amount: number | string;
  entry_price_amount: number | string;
  max_entries: number | null;
  max_tickets_per_purchase: number;
  entry_limit_per_user: number | null;
  status: string;
  rules_public: Record<string, unknown> | null;
  opens_at: string | null;
  closes_at: string | null;
  compliance_approved_at: string | null;
  prize_secured_at: string | null;
  funding_target_met_at: string | null;
  entries_closed_at: string | null;
  funds_reconciled_at: string | null;
  draw_authorized_at: string | null;
  drawn_at: string | null;
  prize_delivered_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlayAdminAdProvider = {
  provider_key: string;
  display_name: string;
  adapter_key: string;
  supported_platforms: string[];
  status: string;
  public_config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type PlayAdminAdPlacement = {
  id: string;
  placement_code: string;
  provider_key: string;
  ad_format: string;
  platforms: string[];
  placement_config: Record<string, unknown> | null;
  reward_points: number | null;
  opt_in_required: boolean;
  daily_user_cap: number | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type PlayAdminDashboard = {
  engines: PlayAdminEngine[];
  releases: Array<Record<string, unknown>>;
  experiences: PlayAdminExperience[];
  campaigns: PlayAdminCampaign[];
  adProviders: PlayAdminAdProvider[];
  adPlacements: PlayAdminAdPlacement[];
  rewards: Array<Record<string, unknown>>;
};

export type PlayAdminEntryOrder = {
  id: string;
  campaign_id: string;
  user_id: string;
  ticket_count: number;
  currency_code: string;
  unit_price_amount: number | string;
  total_amount: number | string;
  status: string;
  ledger_journal_id: number | null;
  refund_journal_id: number | null;
  refund_reason: string | null;
  created_at: string;
  refunded_at: string | null;
  campaign_title: string;
};

export type PlayAdminDraw = {
  id: string;
  campaign_id: string;
  status: string;
  ticket_count_snapshot: number;
  entries_digest: string;
  seed_commitment: string;
  selection_counter: number;
  winning_ticket_id: string | null;
  winning_ticket_code: string | null;
  authorized_by: string;
  authorized_at: string;
  executed_by: string | null;
  executed_at: string | null;
  voided_by: string | null;
  voided_at: string | null;
  void_reason: string | null;
  result_digest: string | null;
  campaign_title: string;
};

export type PlayAdminSettlement = {
  id: string;
  campaign_id: string;
  currency_code: string;
  qualifying_funds_amount: number | string;
  prize_cost_recovered: number | string;
  campaign_costs_recovered: number | string;
  profit_target_amount: number | string;
  excess_amount: number | string;
  prize_journal_id: number;
  costs_journal_id: number | null;
  profit_journal_id: number | null;
  delivery_evidence_reference: string;
  settled_by: string;
  settled_at: string;
  campaign_title: string;
};

export type PlayAdminOperations = {
  entryOrders: PlayAdminEntryOrder[];
  draws: PlayAdminDraw[];
  settlements: PlayAdminSettlement[];
};

function fail(error: { message: string; code?: string; details?: string; hint?: string } | null, fallback: string) {
  if (error) throw userFacingError(error, 'admin', fallback);
}

export async function getAdminPlayDashboard(): Promise<PlayAdminDashboard> {
  const { data, error } = await supabase.rpc('admin_play_dashboard');
  fail(error, 'We could not load VAD Play administration. Refresh and try again.');
  const value = (data ?? {}) as Partial<PlayAdminDashboard>;
  return {
    engines: Array.isArray(value.engines) ? value.engines : [],
    releases: Array.isArray(value.releases) ? value.releases : [],
    experiences: Array.isArray(value.experiences) ? value.experiences : [],
    campaigns: Array.isArray(value.campaigns) ? value.campaigns : [],
    adProviders: Array.isArray(value.adProviders) ? value.adProviders : [],
    adPlacements: Array.isArray(value.adPlacements) ? value.adPlacements : [],
    rewards: Array.isArray(value.rewards) ? value.rewards : [],
  };
}

export async function getAdminPlayOperations(campaignId?: string | null): Promise<PlayAdminOperations> {
  const { data, error } = await supabase.rpc('admin_play_list_operations', {
    p_campaign_id: campaignId ?? null,
  });
  fail(error, 'We could not load VAD Play operations. Check the migration state and admin permission.');
  const value = (data ?? {}) as Partial<PlayAdminOperations>;
  return {
    entryOrders: Array.isArray(value.entryOrders) ? value.entryOrders : [],
    draws: Array.isArray(value.draws) ? value.draws : [],
    settlements: Array.isArray(value.settlements) ? value.settlements : [],
  };
}

export async function saveAdminPlayExperience(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('admin_play_upsert_experience', { p_payload: payload });
  fail(error, 'This VAD Play draft could not be saved.');
  return String(data);
}

export async function publishAdminPlayPracticeExperience(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('admin_play_publish_practice_experience', { p_payload: payload });
  fail(error, 'This free game could not be published. Check the title and try again.');
  return String(data);
}

export async function saveAdminPlayCampaign(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('admin_play_upsert_campaign', { p_payload: payload });
  fail(error, 'This campaign draft could not be saved. Check every required economics field.');
  return String(data);
}

export async function saveAdminPlayAdPlacement(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('admin_play_upsert_ad_placement', { p_payload: payload });
  fail(error, 'This sponsor placement could not be saved.');
  return String(data);
}

export async function setAdminPlayDirectSponsorEnabled(enabled: boolean) {
  const { data, error } = await supabase.rpc('admin_play_set_direct_sponsor_status', { p_enabled: enabled });
  fail(error, 'Direct sponsorship settings could not be updated.');
  return Boolean(data);
}
