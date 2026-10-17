import { supabase } from '@/lib/supabase';

export type HomeHeroImage = {
  imageUrl: string;
  generatedAt: string;
  expiresAt: string;
  cached: boolean;
};

/**
 * Returns the shared Home hero artwork. Generation and the 24-hour cache
 * are owned by the existing Cloudflare Workers AI provider through Supabase.
 */
export async function getHomeHeroImage(): Promise<HomeHeroImage> {
  const { data, error } = await supabase.functions.invoke('home-hero-image-runtime');

  if (error) throw error;
  if (
    !data ||
    typeof data.imageUrl !== 'string' ||
    typeof data.generatedAt !== 'string' ||
    typeof data.expiresAt !== 'string'
  ) {
    throw new Error('The Home hero image is not available yet.');
  }

  return {
    imageUrl: data.imageUrl,
    generatedAt: data.generatedAt,
    expiresAt: data.expiresAt,
    cached: data.cached === true,
  };
}
