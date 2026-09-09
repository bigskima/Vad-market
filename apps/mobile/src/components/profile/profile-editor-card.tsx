import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { pickProfileImage } from '@/lib/profile-image-picker';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getMyProfile,
  profileMediaUrl,
  updateMyProfile,
  uploadProfileMedia,
  type UserProfile,
} from '@/services/profile-api';
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
      setProfile(next);
      setDisplayName(next.display_name ?? '');
      setHandle(next.handle ?? '');
      setBio(next.bio ?? '');
    } catch (error) {
      Alert.alert(
        'Profile unavailable',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function save() {
    setWorking(true);
    try {
      await updateMyProfile({ displayName, handle, bio });
      await load();
      setEditing(false);
      Alert.alert('Profile updated', 'Your public VAD identity is up to date.');
    } catch (error) {
      Alert.alert(
        'Profile not updated',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setWorking(false);
    }
  }

  async function choose(kind: 'avatar' | 'banner') {
    setWorking(true);
    try {
      const image = await pickProfileImage();
      if (!image) return;
      await uploadProfileMedia(kind, image.bytes, image.mimeType);
      await load();
    } catch (error) {
      Alert.alert(
        'Image not uploaded',
        error instanceof Error ? error.message : 'Please try another image.',
      );
    } finally {
      setWorking(false);
    }
  }

  function cancelEdit() {
    setDisplayName(profile?.display_name ?? '');
    setHandle(profile?.handle ?? '');
    setBio(profile?.bio ?? '');
    setEditing(false);
  }

  if (loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton height={160} radius={theme.radius.xl} />
        <VadSkeleton width={86} height={86} radius={43} />
        <VadSkeleton width="48%" height={28} />
        <VadSkeleton height={82} />
      </View>
    );
  }

  const banner = profileMediaUrl(profile?.banner_path);
  const publicName = profile?.display_name || profile?.handle || 'VAD member';

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View
        style={{
          borderRadius: theme.radius.xl,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change profile banner"
          onPress={() => void choose('banner')}
          disabled={working}
          style={{ height: 160, backgroundColor: theme.colors.brandSoft }}
        >
          {banner ? (
            <Image
              source={{ uri: banner }}
              resizeMode="cover"
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                gap: theme.spacing.xs,
              }}
            >
              <VadText variant="heading" tone="brand">Add a banner</VadText>
              <VadText variant="caption" tone="secondary">
                Give your VAD profile a recognizable header.
              </VadText>
            </View>
          )}

          <View
            style={{
              position: 'absolute',
              right: theme.spacing.sm,
              bottom: theme.spacing.sm,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.surface,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
            }}
          >
            <VadText variant="caption">Change banner</VadText>
          </View>
        </Pressable>

        <View
          style={{
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <View
            style={{
              marginTop: -46,
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: theme.spacing.md,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              onPress={() => void choose('avatar')}
              disabled={working}
              style={{
                borderWidth: 4,
                borderColor: theme.colors.surface,
                borderRadius: 50,
              }}
            >
              <ProfileAvatar
                path={profile?.avatar_path}
                name={publicName}
                size={88}
              />
            </Pressable>

            <VadButton
              label={editing ? 'Cancel' : 'Edit profile'}
              variant="secondary"
              fullWidth={false}
              disabled={working}
              onPress={editing ? cancelEdit : () => setEditing(true)}
            />
          </View>

          {!editing ? (
            <View style={{ gap: theme.spacing.xs }}>
              <View style={{ gap: 2 }}>
                <VadText variant="title">{publicName}</VadText>
                <VadText variant="caption" tone="secondary">
                  @{profile?.handle || 'member'}
                </VadText>
              </View>

              {profile?.bio ? (
                <VadText tone="secondary">{profile.bio}</VadText>
              ) : (
                <VadText variant="caption" tone="secondary">
                  Add a short bio so people understand the perspective behind
                  your convictions.
                </VadText>
              )}
            </View>
          ) : null}
        </View>
      </View>

      {editing ? (
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: theme.spacing.xs }}>
            <VadText variant="heading">Public identity</VadText>
            <VadText variant="caption" tone="secondary">
              These details appear on creator posts, market discussions and
              comments.
            </VadText>
          </View>

          <VadInput
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your public name"
            returnKeyType="next"
          />
          <VadInput
            label="Handle"
            value={handle}
            onChangeText={setHandle}
            placeholder="yourhandle"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
          <VadInput
            label="Bio"
            value={bio}
            onChangeText={setBio}
            placeholder="What should people know about your perspective?"
            multiline
          />

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <VadButton
              label="Cancel"
              variant="secondary"
              disabled={working}
              onPress={cancelEdit}
            />
            <VadButton
              label="Save changes"
              loading={working}
              disabled={!displayName.trim() && !handle.trim()}
              onPress={() => void save()}
            />
          </View>
        </View>
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          <VadText variant="heading">Profile media</VadText>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <MediaAction
              label="Profile photo"
              onPress={() => void choose('avatar')}
              disabled={working}
            />
            <MediaAction
              label="Banner"
              onPress={() => void choose('banner')}
              disabled={working}
            />
          </View>
        </View>
      )}
    </View>
  );
}

function MediaAction({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 60,
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.lg,
        paddingHorizontal: theme.spacing.md,
        backgroundColor: theme.colors.surface,
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      <VadText variant="label">{label}</VadText>
      <VadText variant="caption" tone="tertiary">Change →</VadText>
    </Pressable>
  );
}
