import { supabase } from '@/lib/supabase';

export type ConvictionPost = {
  post_public_id: string;
  author_user_id: string;
  author_handle: string | null;
  author_display_name: string | null;
  author_avatar_path: string | null;
  post_type: 'ANALYSIS' | 'PREDICTION' | 'COMMENTARY' | 'SHORT_VIDEO';
  body: string;
  media_path: string | null;
  stance_outcome_code: string | null;
  confidence: number | string | null;
  instrument_public_id: string | null;
  event_public_id: string | null;
  market_title: string | null;
  asset_code: string | null;
  yes_price: number | string | null;
  no_price: number | string | null;
  reaction_count: number | string;
  comment_count: number | string;
  viewer_liked: boolean;
  viewer_follows_author: boolean;
  created_at: string;
};

export type CreatorReputation = {
  userId: string;
  followers: number;
  following: number;
  posts: number;
  predictions: number;
  originatedMarkets: number;
  resolvedPredictions: number;
  correctPredictions: number;
  accuracy: number | null;
  calibratedPredictions: number;
  brierScore: number | null;
  calibrationScore: number | null;
  evidenceWeightedReputation: number;
  method: string;
  generatedAt: string;
};

export type PostComment = {
  comment_public_id: string;
  author_user_id: string;
  author_handle: string | null;
  author_display_name: string | null;
  author_avatar_path: string | null;
  body: string;
  created_at: string;
  parent_comment_public_id: string | null;
};

export type CreatorPrediction = {
  post_public_id: string;
  body: string;
  confidence: number | string | null;
  stance_outcome_code: string;
  event_public_id: string;
  market_title: string;
  resolution_status: string | null;
  resolved_outcome_code: string | null;
  correct: boolean | null;
  created_at: string;
  finalized_at: string | null;
};

function fail(error: { message: string } | null) { if (error) throw new Error(error.message); }

export async function getConvictionFeed(limit = 30, offset = 0) { const { data, error } = await supabase.rpc('social_feed', { p_limit: limit, p_offset: offset }); fail(error); return (data ?? []) as ConvictionPost[]; }
export async function publishConvictionPost(input: { body: string; postType?: 'ANALYSIS' | 'PREDICTION' | 'COMMENTARY'; instrumentPublicId?: string | null; stanceOutcomeCode?: 'YES' | 'NO' | null; confidence?: number | null }) { const { data, error } = await supabase.rpc('create_conviction_post', { p_body: input.body, p_post_type: input.postType ?? 'ANALYSIS', p_instrument_public_id: input.instrumentPublicId ?? null, p_stance_outcome_code: input.stanceOutcomeCode ?? null, p_confidence: input.confidence ?? null, p_media_path: null }); fail(error); return data as string; }
export async function togglePostLike(postPublicId: string) { const { data, error } = await supabase.rpc('toggle_post_like', { p_post_public_id: postPublicId }); fail(error); return Boolean(data); }
export async function toggleCreatorFollow(creatorUserId: string) { const { data, error } = await supabase.rpc('toggle_creator_follow', { p_creator_user_id: creatorUserId }); fail(error); return Boolean(data); }
export async function addPostComment(postPublicId: string, body: string) { const { data, error } = await supabase.rpc('add_post_comment', { p_post_public_id: postPublicId, p_body: body }); fail(error); return data as string; }
export async function addPostReply(postPublicId: string, parentCommentPublicId: string, body: string) { const { data, error } = await supabase.rpc('add_post_reply', { p_post_public_id: postPublicId, p_parent_comment_public_id: parentCommentPublicId, p_body: body }); fail(error); return data as string; }
export async function getPostComments(postPublicId: string, limit = 50) { const { data, error } = await supabase.rpc('post_comments', { p_post_public_id: postPublicId, p_limit: limit }); fail(error); return (data ?? []) as PostComment[]; }
export async function getCreatorReputation(creatorUserId: string) { const { data, error } = await supabase.rpc('creator_reputation', { p_creator_user_id: creatorUserId }); fail(error); return data as CreatorReputation; }
export async function getCreatorPredictionHistory(creatorUserId: string, limit = 20, offset = 0) { const { data, error } = await supabase.rpc('creator_prediction_history', { p_creator_user_id: creatorUserId, p_limit: limit, p_offset: offset }); fail(error); return (data ?? []) as CreatorPrediction[]; }
export async function getCreatorOriginatedMarkets(creatorUserId: string, limit = 20, offset = 0) { const { data, error } = await supabase.rpc('creator_originated_markets', { p_creator_user_id: creatorUserId, p_limit: limit, p_offset: offset }); fail(error); return (data ?? []) as Record<string, unknown>[]; }
export async function getMarketCreatorAttribution(instrumentPublicId: string) { const { data, error } = await supabase.rpc('market_creator_attribution', { p_instrument_public_id: instrumentPublicId }); fail(error); return data as Record<string, unknown> | null; }
