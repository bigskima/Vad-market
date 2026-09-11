import { supabase } from '@/lib/supabase';

export type UserProfile = {
  user_id: string;
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_path: string | null;
  banner_path: string | null;
};

export type CreatorPublicProfile = {
  userId: string;
  handle: string;
  displayName: string | null;
  bio: string | null;
  avatarPath: string | null;
  bannerPath: string | null;
  viewerFollows: boolean;
  isSelf: boolean;
};

const USERNAME_PATTERN = /^[a-z0-9_][a-z0-9_.-]{1,29}$/;

export function normalizeUsername(value: string) {
  return value.trim().replace(/^@+/, '').toLowerCase();
}

export function profileMediaUrl(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl;
}

export async function getMyProfile() {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Sign in to edit your profile.');
  const { data, error } = await supabase.from('profiles').select('user_id,handle,display_name,bio,avatar_path,banner_path').eq('user_id', userId).single();
  if (error) throw new Error(error.message);
  return data as UserProfile;
}

export async function updateMyProfile(input: { displayName: string; handle: string; bio: string }) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Sign in to edit your profile.');

  const username = normalizeUsername(input.handle);
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error('Username must be 2-30 characters using letters, numbers, underscore, dot or hyphen.');
  }

  const { error } = await supabase.from('profiles').update({
    display_name: input.displayName.trim() || null,
    handle: username,
    bio: input.bio.trim() || null,
  }).eq('user_id', userId);
  if (error) {
    if (error.code === '23505') throw new Error('That username is already taken. Choose another one.');
    throw new Error(error.message);
  }
}

export async function uploadProfileMedia(kind: 'avatar' | 'banner', bytes: ArrayBuffer, mimeType: string) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Sign in to upload profile media.');
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const path = `${userId}/${kind}.${ext}`;
  const { error: uploadError } = await supabase.storage.from('profile-media').upload(path, bytes, { contentType: mimeType, upsert: true, cacheControl: '3600' });
  if (uploadError) throw new Error(uploadError.message);
  const column = kind === 'avatar' ? 'avatar_path' : 'banner_path';
  const { error: profileError } = await supabase.from('profiles').update({ [column]: path }).eq('user_id', userId);
  if (profileError) throw new Error(profileError.message);
  return path;
}

export async function getCreatorPublicProfile(creatorUserId: string) {
  const { data, error } = await supabase.rpc('creator_public_profile', { p_creator_user_id: creatorUserId });
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    ...(data as Omit<CreatorPublicProfile, 'viewerFollows' | 'isSelf'>),
    viewerFollows: false,
    isSelf: false,
  } as CreatorPublicProfile;
}

export async function getCreatorPublicProfileByUsername(username: string) {
  const normalized = normalizeUsername(username);
  if (!USERNAME_PATTERN.test(normalized)) return null;

  const { data, error } = await supabase.rpc('creator_public_profile_by_username', {
    p_username: normalized,
  });
  if (error) throw new Error(error.message);
  return data as CreatorPublicProfile | null;
}
