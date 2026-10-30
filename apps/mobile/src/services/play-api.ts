import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';

export type PlayExperience = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  experience_type: string;
  engine_key: string;
  status: 'PUBLISHED';
  hero_asset_url: string | null;
  card_asset_url: string | null;
  image_alt: string | null;
  display_order: number;
  published_at: string | null;
  public_config: Record<string, unknown> | null;
};

export type PlayCampaign = {
  id: string;
  experience_id: string;
  slug: string;
  title: string;
  prize_title: string;
  currency_code: string;
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
  published_at: string | null;
};

export type PlayCampaignPrize = {
  id: string;
  campaign_id: string;
  title: string;
  description: string | null;
  asset_path: string | null;
  model_asset_path: string | null;
  image_alt: string | null;
  stock_quantity: number;
  winner_limit: number;
  awards_count: number;
  fulfilled_count: number;
  display_order: number;
  status: 'ACTIVE' | 'RETIRED';
  created_at: string;
};

export type PlayPrizeAward = {
  id: string;
  public_id: string;
  campaign_id: string;
  draw_id: string;
  prize_id: string;
  ticket_id: number;
  user_id: string;
  award_number: number;
  claim_status: 'AWARDED' | 'CLAIMED' | 'FULFILLMENT_PENDING' | 'FULFILLED' | 'EXPIRED' | 'CANCELLED';
  claimed_at: string | null;
  fulfilled_at: string | null;
  created_at: string;
};

export type PlayTicket = {
  ticketId: string;
  ticketCode: string;
  status: string;
};

export type PlayTicketPurchase = {
  entryOrderId: string;
  campaignId: string;
  status: string;
  ticketCount: number;
  totalAmount: number | string;
  currencyCode: string;
  tickets: PlayTicket[];
  idempotentReplay: boolean;
};

export type PlayDrawAudit = {
  campaignId: string;
  campaignTitle?: string;
  status: string;
  drawId?: string;
  ticketCount?: number | null;
  entriesDigest?: string | null;
  seedCommitment?: string | null;
  seedReveal?: string | null;
  winningTicketId?: string;
  winningTicketCode?: string;
  algorithm?: string;
  selectionCounter?: number;
  authorizedAt?: string;
  executedAt?: string;
  resultDigest?: string;
  voidedAt?: string | null;
  voidReason?: string | null;
};

export type PlayDrawAuditTicket = {
  ticketId: string;
  ticketCode: string;
  status: string;
};

export type PlayDrawAuditTicketPage = {
  campaignId: string;
  tickets: PlayDrawAuditTicket[];
  nextAfterTicketId: number | string | null;
  hasMore: boolean;
  pageSize: number;
};

export type PlayActivity = {
  id: string;
  experience_id: string | null;
  activity_type: string;
  status: string;
  reference: string | null;
  amount: string | number | null;
  currency_code: string | null;
  occurred_at: string;
  experience: { title: string; slug: string } | null;
};

const EXPERIENCE_FIELDS =
  'id, slug, title, subtitle, description, experience_type, engine_key, status, hero_asset_url, card_asset_url, image_alt, display_order, published_at, public_config';

export async function listPublishedPlayExperiences(): Promise<PlayExperience[]> {
  const { data, error } = await supabase
    .from('play_experiences')
    .select(EXPERIENCE_FIELDS)
    .eq('status', 'PUBLISHED')
    .order('display_order', { ascending: true })
    .order('published_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as PlayExperience[];
}

export async function getPublishedPlayExperience(slug: string): Promise<PlayExperience | null> {
  const { data, error } = await supabase
    .from('play_experiences')
    .select(EXPERIENCE_FIELDS)
    .eq('slug', slug)
    .eq('status', 'PUBLISHED')
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as unknown as PlayExperience | null;
}

export async function listExperiencePlayCampaigns(experienceId: string): Promise<PlayCampaign[]> {
  if (!experienceId) return [];

  const { data, error } = await supabase
    .from('play_campaigns')
    .select('id, experience_id, slug, title, prize_title, currency_code, funding_threshold_amount, qualifying_funds_amount, entry_price_amount, max_entries, max_tickets_per_purchase, entry_limit_per_user, status, rules_public, opens_at, closes_at, published_at')
    .eq('experience_id', experienceId)
    .in('status', ['OPEN', 'FUNDING_TARGET_MET', 'FUNDING_SHORTFALL', 'ENTRY_CLOSED', 'DRAW_ELIGIBLE', 'DRAW_AUTHORIZED', 'DRAWN', 'SETTLED'])
    .order('opens_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as PlayCampaign[];
}

export async function buyPlayTickets(
  campaignId: string,
  ticketCount: number,
  idempotencyKey: string,
): Promise<PlayTicketPurchase> {
  const { data, error } = await supabase.rpc('play_buy_tickets', {
    p_campaign_id: campaignId,
    p_ticket_count: ticketCount,
    p_idempotency_key: idempotencyKey,
  });

  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('VAD returned an unexpected ticket purchase response.');
  }

  return data as unknown as PlayTicketPurchase;
}

export function createPlayIdempotencyKey() {
  return Crypto.randomUUID();
}

export type PlayPracticeGameReply = {
  sessionId: string;
  status: string;
  result: {
    gameTitle?: string;
    outcomeCode: string;
    message: string;
    practiceOnly: boolean;
    rewardKind: 'NONE';
  };
  replayed: boolean;
};

export async function playPracticeGame(experienceId: string): Promise<PlayPracticeGameReply> {
  const { data, error } = await supabase.rpc('play_practice_game', {
    p_experience_id: experienceId,
    p_idempotency_key: createPlayIdempotencyKey(),
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('VAD returned an unexpected game result.');
  }
  const value = data as Record<string, unknown>;
  const result = value.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('VAD returned an incomplete game result.');
  }
  const publicResult = result as Record<string, unknown>;
  if (typeof publicResult.message !== 'string' || typeof publicResult.outcomeCode !== 'string') {
    throw new Error('VAD returned an incomplete game result.');
  }
  return {
    sessionId: String(value.sessionId ?? ''),
    status: String(value.status ?? 'COMPLETED'),
    result: {
      gameTitle: typeof publicResult.gameTitle === 'string' ? publicResult.gameTitle : undefined,
      outcomeCode: publicResult.outcomeCode,
      message: publicResult.message,
      practiceOnly: publicResult.practiceOnly === true,
      rewardKind: 'NONE',
    },
    replayed: value.replayed === true,
  };
}

export async function getPlayDrawAudit(campaignId: string): Promise<PlayDrawAudit | null> {
  const { data, error } = await supabase.rpc('play_draw_audit', {
    p_campaign_id: campaignId,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  return data as unknown as PlayDrawAudit;
}

export async function getPlayDrawAuditTicketPage(
  campaignId: string,
  afterTicketId: number | string | null = null,
  limit = 50,
): Promise<PlayDrawAuditTicketPage> {
  const { data, error } = await supabase.rpc('play_draw_audit_ticket_page', {
    p_campaign_id: campaignId,
    p_after_ticket_id: afterTicketId == null ? 0 : afterTicketId,
    p_limit: limit,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('VAD returned an unexpected draw-audit response.');
  }
  const value = data as Record<string, unknown>;
  return {
    campaignId: String(value.campaignId ?? campaignId),
    tickets: Array.isArray(value.tickets) ? value.tickets as PlayDrawAuditTicket[] : [],
    nextAfterTicketId: typeof value.nextAfterTicketId === 'number' || typeof value.nextAfterTicketId === 'string'
      ? value.nextAfterTicketId
      : null,
    hasMore: Boolean(value.hasMore),
    pageSize: Number(value.pageSize ?? limit),
  };
}

export async function listMyPlayActivity(userId: string): Promise<PlayActivity[]> {
  if (!userId) return [];

  const { data, error } = await supabase
    .from('play_participations')
    .select('id, experience_id, activity_type, status, reference, amount, currency_code, occurred_at, experience:play_experiences(title, slug)')
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as unknown as PlayActivity[];
}

export function playFriendlyError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';

  if (['42P01', '42703', '42883', 'PGRST202', 'PGRST205', 'PGRST200'].includes(code)) {
    return 'VAD Play database changes are not available in this environment yet. Apply the reviewed Play migrations and try again.';
  }

  return 'We could not load this Play information. Check your connection and try again.';
}

export function playPurchaseFriendlyError(error: unknown) {
  const message = error instanceof Error
    ? error.message.toLowerCase()
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '').toLowerCase()
      : '';
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';

  if (message.includes('insufficient available balance')) {
    return 'Your available VAD wallet balance is not enough for this purchase. Reduce the ticket quantity or fund your wallet.';
  }
  if (message.includes('location verification')) {
    return 'Complete the required location verification before buying entries with NGN.';
  }
  if (message.includes('identity verification') || message.includes('kyc')) {
    return 'Complete the required identity verification before buying paid entries.';
  }
  if (message.includes('jurisdiction')) {
    return 'Paid entries in this currency are not available for your account’s current jurisdiction.';
  }
  if (message.includes('not accepting entries') || message.includes('campaign is not accepting')) {
    return 'This campaign has stopped accepting entries. Refresh the page to see its latest status.';
  }
  if (message.includes('not enabled for paid entries') || message.includes('engine is not')) {
    return 'Paid entries are not currently enabled for this game. No purchase was made.';
  }
  if (message.includes('exceeds this campaign')) {
    return 'That ticket quantity exceeds this campaign’s limit. Choose a smaller quantity.';
  }
  if (message.includes('not enough entries remaining')) {
    return 'There are not enough tickets remaining for that quantity. Refresh the campaign and try again.';
  }
  if (message.includes('sign in') || code === '28000') {
    return 'Sign in to your VAD account before buying tickets.';
  }
  if (message.includes('idempotency key')) {
    return 'This purchase request was already used. Retry the same request to confirm whether tickets were issued.';
  }
  if (message.includes('required reviews')) {
    return 'This campaign has not completed its required approvals. No purchase was made.';
  }
  return 'We could not confirm this ticket purchase. Retry the same request before starting another purchase.';
}

export function playExperienceLabel(value: string) {
  return value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}


export async function listPlayCampaignPrizes(campaignId: string): Promise<PlayCampaignPrize[]> {
  if (!campaignId) return [];
  const { data, error } = await supabase
    .from('play_campaign_prizes')
    .select('id, campaign_id, title, description, asset_path, model_asset_path, image_alt, stock_quantity, winner_limit, awards_count, fulfilled_count, display_order, status, created_at')
    .eq('campaign_id', campaignId)
    .eq('status', 'ACTIVE')
    .order('display_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PlayCampaignPrize[];
}

export async function listMyCampaignPrizeAwards(campaignId: string): Promise<PlayPrizeAward[]> {
  if (!campaignId) return [];
  const { data, error } = await supabase
    .from('play_campaign_prize_awards')
    .select('id, public_id, campaign_id, draw_id, prize_id, ticket_id, user_id, award_number, claim_status, claimed_at, fulfilled_at, created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PlayPrizeAward[];
}

export async function claimPlayCampaignPrize(awardId: string) {
  if (!awardId) throw new Error('A prize award is required.');
  const { data, error } = await supabase.rpc('play_claim_campaign_prize', {
    p_award_id: awardId,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('VAD returned an unexpected prize-claim response.');
  }
  return data as Record<string, unknown>;
}
