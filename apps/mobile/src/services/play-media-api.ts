import * as Crypto from 'expo-crypto';

import { pickProfileImage } from '@/lib/profile-image-picker';
import { supabase } from '@/lib/supabase';

export const PLAY_MEDIA_BUCKET = 'play-media';
export const PLAY_MEDIA_MAX_BYTES = 5 * 1024 * 1024;

export type PlayDraftAssist = {
  title: string;
  description: string;
  prizeTitle: string;
  campaignTitle: string;
  terms: string;
  refundPolicy: string;
  imagePrompt: string;
  riskNotes: string;
};

export function playMediaPublicUrl(path: string | null | undefined) {
  const value = path?.trim();
  if (!value) return null;
  if (/^https:\/\//i.test(value)) return value;
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(value)
    || value.startsWith('/')
    || !/^[A-Za-z0-9_./-]+$/.test(value)
  ) return null;
  return supabase.storage.from(PLAY_MEDIA_BUCKET).getPublicUrl(value).data.publicUrl;
}

export async function uploadPlayMedia() {
  const selected = await pickProfileImage({ allowsEditing: false });
  if (!selected) return null;
  if (selected.bytes.byteLength > PLAY_MEDIA_MAX_BYTES) {
    throw new Error('Choose an image smaller than 5 MB.');
  }

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Sign in again before uploading Play artwork.');

  const mimeType = normalizeMimeType(selected.mimeType);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    throw new Error('Choose a JPG, PNG or WebP image.');
  }
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${auth.user.id}/uploads/${Crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(PLAY_MEDIA_BUCKET).upload(path, selected.bytes, {
    cacheControl: '31536000',
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw new Error(error.message || 'Play artwork could not be uploaded.');
  return path;
}

export async function generatePlayCampaignImage(input: {
  title: string;
  prizeTitle?: string;
  visualDirection?: string;
}) {
  const { data, error } = await supabase.functions.invoke('vad-play-campaign-image', { body: input });
  if (error) throw new Error(error.message || 'AI artwork generation is unavailable.');
  const mediaPath = typeof data?.mediaPath === 'string' ? data.mediaPath : '';
  if (!mediaPath) throw new Error(typeof data?.message === 'string' ? data.message : 'The artwork service returned no storage path.');
  return mediaPath;
}

export async function draftPlayCampaign(input: {
  idea: string;
  engineKey: string;
  currency?: string | null;
}) {
  const { data, error } = await supabase.functions.invoke('vad-play-campaign-draft', { body: input });
  if (error) throw new Error(error.message || 'AI game drafting is unavailable.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The game-draft assistant returned an unexpected response.');
  }
  return data as PlayDraftAssist & { riskNotes?: string };
}

function normalizeMimeType(value: string | null | undefined) {
  const normalized = String(value ?? '').toLowerCase().trim();
  if (normalized === 'image/jpg') return 'image/jpeg';
  if (normalized === 'image/jpeg' || normalized === 'image/png' || normalized === 'image/webp') return normalized;
  throw new Error('Choose a JPG, PNG or WebP image.');
}
