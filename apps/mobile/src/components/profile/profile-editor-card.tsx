import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { pickProfileImage } from '@/lib/profile-image-picker';
import { useVadTheme } from '@/providers/theme-provider';
import { getMyProfile, profileMediaUrl, updateMyProfile, uploadProfileMedia, type UserProfile } from '@/services/profile-api';
import { ProfileAvatar } from './profile-avatar';

export function ProfileEditorCard() {
  const theme = useVadTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await getMyProfile();
      setProfile(next); setDisplayName(next.display_name ?? ''); setHandle(next.handle ?? ''); setBio(next.bio ?? '');
    } catch (error) { Alert.alert('Profile unavailable', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);

  async function save() {
    setWorking(true);
    try { await updateMyProfile({ displayName, handle, bio }); await load(); Alert.alert('Profile updated', 'Your public VAD identity is up to date.'); }
    catch (error) { Alert.alert('Profile not updated', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setWorking(false); }
  }

  async function choose(kind: 'avatar' | 'banner') {
    setWorking(true);
    try {
      const image = await pickProfileImage();
      if (!image) return;
      await uploadProfileMedia(kind, image.bytes, image.mimeType);
      await load();
    } catch (error) { Alert.alert('Image not uploaded', error instanceof Error ? error.message : 'Please try another image.'); }
    finally { setWorking(false); }
  }

  if (loading) return <VadCard><VadSkeleton height={116} /><VadSkeleton width={72} height={72} /></VadCard>;
  const banner = profileMediaUrl(profile?.banner_path);
  return <VadCard variant="raised" style={{ overflow: 'hidden', padding: 0 }}>
    <Pressable onPress={() => void choose('banner')} style={{ height: 126, backgroundColor: theme.colors.brandSoft }}>
      {banner ? <Image source={{ uri: banner }} resizeMode="cover" style={{ width: '100%', height: '100%' }} /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><VadText variant="label" tone="brand">Add profile banner</VadText></View>}
      <View style={{ position: 'absolute', right: 12, bottom: 10, backgroundColor: theme.colors.surface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}><VadText variant="caption">Change banner</VadText></View>
    </Pressable>
    <View style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
      <View style={{ marginTop: -48, alignSelf: 'flex-start', borderWidth: 4, borderColor: theme.colors.surface, borderRadius: 50 }}><Pressable onPress={() => void choose('avatar')}><ProfileAvatar path={profile?.avatar_path} name={displayName || handle} size={86} /></Pressable></View>
      <View><VadText variant="heading">Public profile</VadText><VadText variant="caption" tone="secondary">Your avatar and banner are used across creator posts, market discussions and comments.</VadText></View>
      <VadInput label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Your public name" />
      <VadInput label="Handle" value={handle} onChangeText={setHandle} placeholder="yourhandle" autoCapitalize="none" />
      <VadInput label="Bio" value={bio} onChangeText={setBio} placeholder="What should people know about your perspective?" multiline />
      <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}><VadButton label="Change photo" variant="secondary" fullWidth={false} disabled={working} onPress={() => void choose('avatar')} /><VadButton label="Save profile" fullWidth={false} loading={working} onPress={() => void save()} /></View>
    </View>
  </VadCard>;
}
