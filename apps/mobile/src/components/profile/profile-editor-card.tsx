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
  const [editing, setEditing] = useState(false);

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
    try { await updateMyProfile({ displayName, handle, bio }); await load(); setEditing(false); Alert.alert('Profile updated', 'Your public VAD identity is up to date.'); }
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

  function cancelEdit() {
    setDisplayName(profile?.display_name ?? '');
    setHandle(profile?.handle ?? '');
    setBio(profile?.bio ?? '');
    setEditing(false);
  }

  if (loading) return <VadCard><VadSkeleton height={116} /><VadSkeleton width={72} height={72} /></VadCard>;
  const banner = profileMediaUrl(profile?.banner_path);
  const publicName = profile?.display_name || profile?.handle || 'VAD member';

  return <VadCard variant="raised" style={{ overflow: 'hidden', padding: 0 }}>
    <Pressable onPress={() => void choose('banner')} disabled={working} style={{ height: 126, backgroundColor: theme.colors.brandSoft }}>
      {banner ? <Image source={{ uri: banner }} resizeMode="cover" style={{ width: '100%', height: '100%' }} /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><VadText variant="label" tone="brand">Add profile banner</VadText></View>}
      <View style={{ position: 'absolute', right: 12, bottom: 10, backgroundColor: theme.colors.surface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}><VadText variant="caption">Edit banner</VadText></View>
    </Pressable>

    <View style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: theme.spacing.md }}>
        <View style={{ marginTop: -48, borderWidth: 4, borderColor: theme.colors.surface, borderRadius: 50 }}><Pressable onPress={() => void choose('avatar')} disabled={working}><ProfileAvatar path={profile?.avatar_path} name={publicName} size={86} /></Pressable></View>
        <VadButton label={editing ? 'Cancel' : 'Edit profile'} variant="secondary" fullWidth={false} disabled={working} onPress={editing ? cancelEdit : () => setEditing(true)} />
      </View>

      {!editing ? <View style={{ gap: theme.spacing.xs }}>
        <View>
          <VadText variant="heading">{publicName}</VadText>
          <VadText variant="caption" tone="secondary">@{profile?.handle || 'member'}</VadText>
        </View>
        {profile?.bio ? <VadText tone="secondary">{profile.bio}</VadText> : <VadText variant="caption" tone="secondary">Add a short bio so people understand the perspective behind your convictions.</VadText>}
        <View style={{ flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
          <VadButton label="Change photo" variant="ghost" fullWidth={false} disabled={working} onPress={() => void choose('avatar')} />
          <VadButton label="Change banner" variant="ghost" fullWidth={false} disabled={working} onPress={() => void choose('banner')} />
        </View>
      </View> : <View style={{ gap: theme.spacing.md }}>
        <View><VadText variant="heading">Edit public identity</VadText><VadText variant="caption" tone="secondary">These details appear across creator posts, market discussions and comments.</VadText></View>
        <VadInput label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Your public name" />
        <VadInput label="Handle" value={handle} onChangeText={setHandle} placeholder="yourhandle" autoCapitalize="none" />
        <VadInput label="Bio" value={bio} onChangeText={setBio} placeholder="What should people know about your perspective?" multiline />
        <VadButton label="Save changes" loading={working} onPress={() => void save()} />
      </View>}
    </View>
  </VadCard>;
}
