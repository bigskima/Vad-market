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

  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200') {
    return 'VAD Play data is not available in this environment yet. Apply the Play foundation migration and try again.';
  }

  return 'We could not load this Play information. Check your connection and try again.';
}

export function playExperienceLabel(value: string) {
  return value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
