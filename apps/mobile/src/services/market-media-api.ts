import { supabase } from '@/lib/supabase';

export const MARKET_MEDIA_BUCKET = 'market-media';
export const MARKET_MEDIA_MAX_BYTES = 5 * 1024 * 1024;

export type MarketMediaSelection = {
  uri: string;
  mimeType: string | null;
  fileName: string | null;
  fileSize: number | null;
  width: number;
  height: number;
};

const supportedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function marketMediaPublicUrl(path: string | null | undefined) {
  if (!path) return null;
  return supabase.storage.from(MARKET_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function uploadMarketMedia(
  selection: MarketMediaSelection,
  scope: 'proposals' | 'markets',
) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Sign in again before uploading market media.');

  const mimeType = normalizeMimeType(selection.mimeType, selection.fileName, selection.uri);
  if (!supportedMimeTypes.has(mimeType)) {
    throw new Error('Choose a JPG, PNG or WebP image for this market.');
  }

  if (selection.fileSize != null && selection.fileSize > MARKET_MEDIA_MAX_BYTES) {
    throw new Error('Market images must be 5 MB or smaller.');
  }

  const response = await fetch(selection.uri);
  if (!response.ok) throw new Error('VAD could not read the selected market image.');
  const body = await response.arrayBuffer();
  if (body.byteLength > MARKET_MEDIA_MAX_BYTES) throw new Error('Market images must be 5 MB or smaller.');

  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${auth.user.id}/${scope}/${nonce}.${extension}`;
  const { error } = await supabase.storage.from(MARKET_MEDIA_BUCKET).upload(path, body, {
    cacheControl: '3600',
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw new Error(error.message || 'VAD could not upload the market image.');
  return path;
}

export async function attachProposalMarketMedia(proposalPublicId: string, mediaPath: string | null) {
  const { error } = await supabase.rpc('set_market_proposal_media', {
    p_proposal_public_id: proposalPublicId,
    p_media_path: mediaPath,
  });
  if (error) throw new Error(error.message || 'VAD could not attach this image to the proposal.');
}

export async function attachAdminMarketMedia(instrumentPublicId: string, mediaPath: string | null) {
  const { error } = await supabase.rpc('admin_set_market_media', {
    p_instrument_public_id: instrumentPublicId,
    p_media_path: mediaPath,
  });
  if (error) throw new Error(error.message || 'VAD could not attach this image to the market.');
}

export async function removeUploadedMarketMedia(path: string | null | undefined) {
  if (!path) return;
  await supabase.storage.from(MARKET_MEDIA_BUCKET).remove([path]);
}

function normalizeMimeType(mimeType: string | null, fileName: string | null, uri: string) {
  const normalized = mimeType?.toLowerCase().trim();
  if (normalized === 'image/jpg') return 'image/jpeg';
  if (normalized && supportedMimeTypes.has(normalized)) return normalized;

  const source = `${fileName ?? ''} ${uri}`.toLowerCase();
  if (/\.png(?:\?|$|\s)/.test(source)) return 'image/png';
  if (/\.webp(?:\?|$|\s)/.test(source)) return 'image/webp';
  return 'image/jpeg';
}
