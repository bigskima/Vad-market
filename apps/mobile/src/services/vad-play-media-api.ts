import * as Crypto from 'expo-crypto';

import { pickProfileImage } from '@/lib/profile-image-picker';
import { supabase } from '@/lib/supabase';

export type PlayMediaKind = 'campaign' | 'experience' | 'sponsor';

export type UploadedPlayMedia = {
  storagePath: string;
  publicUrl: string;
  previewUri?: string;
};

export type PlayGameDraft = {
  experienceTitle: string;
  experienceSlug: string;
  experienceType: string;
  experienceDescription: string;
  campaignTitle: string;
  campaignSlug: string;
  prizeTitle: string;
  terms: string;
  refundPolicy: string;
  imagePrompt: string;
  riskNotes: string;
  engineKey: 'PRIZE_DRAW';
  requiresHumanReview: true;
  economicsFieldsIntentionallyBlank: true;
};

function extensionForMime(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/webp': return 'webp';
    default: throw new Error('Choose a PNG, JPEG or WebP image.');
  }
}

function requireImageType(mimeType: string) {
  const normalized = mimeType.split(';')[0].trim().toLowerCase();
  extensionForMime(normalized);
  return normalized;
}

function messageFromError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '');
    if (message) return message;
  }
  return fallback;
}

export async function pickAndUploadPlayMedia(kind: PlayMediaKind): Promise<UploadedPlayMedia | null> {
  const picked = await pickProfileImage();
  if (!picked) return null;

  const mimeType = requireImageType(picked.mimeType);
  if (picked.bytes.byteLength <= 0 || picked.bytes.byteLength > 8 * 1024 * 1024) {
    throw new Error('Choose an image smaller than 8 MB.');
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Sign in with an authorized VAD Play admin account before uploading artwork.');

  const extension = extensionForMime(mimeType);
  const path = `drafts/${authData.user.id}/${kind}-${Crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from('vad-play-media')
    .upload(path, new Uint8Array(picked.bytes), {
      contentType: mimeType,
      cacheControl: '31536000',
      upsert: false,
    });

  if (error) throw new Error(messageFromError(error, 'Artwork could not be uploaded to VAD Play media storage.'));
  const publicUrl = supabase.storage.from('vad-play-media').getPublicUrl(path).data.publicUrl;
  if (!publicUrl.startsWith('https://')) {
    await supabase.storage.from('vad-play-media').remove([path]);
    throw new Error('The uploaded artwork did not return a secure public URL.');
  }

  return { storagePath: path, publicUrl, previewUri: picked.previewUri };
}

export async function generatePlayArtwork(input: {
  title: string;
  description?: string;
  visualPrompt?: string;
  imageType: PlayMediaKind;
}): Promise<UploadedPlayMedia> {
  const title = input.title.trim();
  if (title.length < 2) throw new Error('Enter a game, campaign or sponsor title first.');

  const { data, error } = await supabase.functions.invoke('vad-play-image-runtime', {
    body: {
      title,
      description: input.description?.trim() || '',
      visualPrompt: input.visualPrompt?.trim() || '',
      imageType: input.imageType,
    },
  });
  if (error) throw new Error(messageFromError(error, 'Artwork generation failed.'));
  if (!data || typeof data !== 'object' || typeof data.storagePath !== 'string' || typeof data.publicUrl !== 'string') {
    throw new Error(typeof data?.error === 'string' ? data.error : 'The image provider did not return a saved VAD Play image.');
  }
  return { storagePath: data.storagePath, publicUrl: data.publicUrl };
}

export async function draftPlayGame(input: {
  idea: string;
  title?: string;
}): Promise<PlayGameDraft> {
  if (input.idea.trim().length < 8) throw new Error('Describe the game idea in at least a short sentence.');

  const { data, error } = await supabase.functions.invoke('vad-play-draft-assistant', {
    body: { idea: input.idea.trim(), title: input.title?.trim() || '', engineKey: 'PRIZE_DRAW' },
  });
  if (error) throw new Error(messageFromError(error, 'AI game drafting failed.'));
  if (!data || typeof data !== 'object' || data.ok !== true) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'The AI provider did not return a draft.');
  }
  return data as PlayGameDraft;
}
