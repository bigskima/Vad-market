import { supabase } from '@/lib/supabase';

export type HomePromotion = {
  public_id: string;
  banner_kind: 'TEXT' | 'IMAGE';
  title: string | null;
  body: string | null;
  image_url: string | null;
  target_path: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicNotice = {
  public_id: string;
  message: string;
  tone: 'WARNING' | 'SUCCESS';
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  priority: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FeaturedMarketRow = {
  instrument_public_id: string;
  active: boolean;
  feature_rank: number;
  featured_at: string;
};

export type HomeExperience = {
  promotions: HomePromotion[];
  notices: PublicNotice[];
  featuredMarkets: FeaturedMarketRow[];
};

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export function isSafeInternalRoute(path: string) {
  const value = path.trim();
  return value === '/' || (value.startsWith('/') && !value.startsWith('//'));
}

export async function getHomeExperience(): Promise<HomeExperience> {
  const [promotionsResult, noticesResult, featuredResult] = await Promise.allSettled([
    supabase
      .from('home_promotions')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false }),
    supabase
      .from('public_notices')
      .select('*')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('market_featured')
      .select('*')
      .eq('active', true)
      .order('feature_rank', { ascending: true })
      .order('featured_at', { ascending: false }),
  ]);

  const promotions =
    promotionsResult.status === 'fulfilled' && !promotionsResult.value.error
      ? ((promotionsResult.value.data ?? []) as HomePromotion[])
      : [];
  const notices =
    noticesResult.status === 'fulfilled' && !noticesResult.value.error
      ? ((noticesResult.value.data ?? []) as PublicNotice[])
      : [];
  const featuredMarkets =
    featuredResult.status === 'fulfilled' && !featuredResult.value.error
      ? ((featuredResult.value.data ?? []) as FeaturedMarketRow[])
      : [];

  const failed = [promotionsResult, noticesResult, featuredResult].some(
    (result) => result.status === 'rejected' || Boolean(result.value?.error),
  );
  if (failed && !promotions.length && !notices.length && !featuredMarkets.length) {
    throw new Error('Home highlights could not be refreshed.');
  }

  return { promotions, notices, featuredMarkets };
}

export async function listAdminHomePromotions() {
  const { data, error } = await supabase
    .from('home_promotions')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  fail(error);
  return (data ?? []) as HomePromotion[];
}

export async function listAdminPublicNotices() {
  const { data, error } = await supabase
    .from('public_notices')
    .select('*')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false });
  fail(error);
  return (data ?? []) as PublicNotice[];
}

export async function upsertAdminHomePromotion(input: {
  publicId?: string | null;
  bannerKind: 'TEXT' | 'IMAGE';
  title?: string | null;
  body?: string | null;
  imageUrl?: string | null;
  targetPath: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  sortOrder?: number;
}) {
  if (!isSafeInternalRoute(input.targetPath)) {
    throw new Error('Destination must be an internal VAD route beginning with /.');
  }
  const { data, error } = await supabase.rpc('admin_upsert_home_promotion', {
    p_public_id: input.publicId ?? null,
    p_banner_kind: input.bannerKind,
    p_title: input.title?.trim() || null,
    p_body: input.body?.trim() || null,
    p_image_url: input.imageUrl?.trim() || null,
    p_target_path: input.targetPath.trim(),
    p_status: input.status,
    p_sort_order: input.sortOrder ?? 100,
  });
  fail(error);
  return String(data);
}

export async function upsertAdminPublicNotice(input: {
  publicId?: string | null;
  message: string;
  tone: 'WARNING' | 'SUCCESS';
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  priority?: number;
}) {
  const { data, error } = await supabase.rpc('admin_upsert_public_notice', {
    p_public_id: input.publicId ?? null,
    p_message: input.message.trim(),
    p_tone: input.tone,
    p_status: input.status,
    p_priority: input.priority ?? 100,
  });
  fail(error);
  return String(data);
}

export async function uploadHomePromotionImage(
  bytes: ArrayBuffer,
  mimeType: string,
) {
  const extension =
    mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const path = `banners/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage.from('home-promotions').upload(path, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  fail(error);
  return supabase.storage.from('home-promotions').getPublicUrl(path).data.publicUrl;
}
