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

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function getConvictionFeed(limit = 30, offset = 0) {
  const { data, error } = await supabase.rpc('social_feed', { p_limit: limit, p_offset: offset });
  fail(error);
  return (data ?? []) as ConvictionPost[];
}

export async function publishConvictionPost(input: {
  body: string;
  postType?: 'ANALYSIS' | 'PREDICTION' | 'COMMENTARY';
  instrumentPublicId?: string | null;
  stanceOutcomeCode?: 'YES' | 'NO' | null;
  confidence?: number | null;
}) {
  const { data, error } = await supabase.rpc('create_conviction_post', {
    p_body: input.body,
    p_post_type: input.postType ?? 'ANALYSIS',
    p_instrument_public_id: input.instrumentPublicId ?? null,
    p_stance_outcome_code: input.stanceOutcomeCode ?? null,
    p_confidence: input.confidence ?? null,
    p_media_path: null,
  });
  fail(error);
  return data as string;
}

export async function togglePostLike(postPublicId: string) {
  const { data, error } = await supabase.rpc('toggle_post_like', { p_post_public_id: postPublicId });
  fail(error);
  return Boolean(data);
}

export async function toggleCreatorFollow(creatorUserId: string) {
  const { data, error } = await supabase.rpc('toggle_creator_follow', { p_creator_user_id: creatorUserId });
  fail(error);
  return Boolean(data);
}

export async function addPostComment(postPublicId: string, body: string) {
  const { data, error } = await supabase.rpc('add_post_comment', { p_post_public_id: postPublicId, p_body: body });
  fail(error);
  return data as string;
}
