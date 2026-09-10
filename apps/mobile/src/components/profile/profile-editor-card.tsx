import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadErrorState } from '@/components/ui/vad-error-state';
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
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const compact = width < 380;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);

    try {
      const next = await getMyProfile();
      setProfile(next);
      setDisplayName(next.display_name ?? '');
      setHandle(next.handle ?? '');
      setBio(next.bio ?? '');
    } catch (error) {
      setLoadError(
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
    setActionError(null);
    setSuccessMessage(null);

    try {
      await updateMyProfile({ displayName, handle, bio });
      await load();
      setEditing(false);
      setSuccessMessage('Your public VAD identity has been updated.');
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setWorking(false);
    }
  }

  async function choose(kind: 'avatar' | 'banner') {
    setWorking(true);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const image = await pickProfileImage();
      if (!image) return;

      await uploadProfileMedia(kind, image.bytes, image.mimeType);
      await load();
      setSuccessMessage(
        kind === 'avatar'
          ? 'Profile photo updated.'
          : 'Profile banner updated.',
      );
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Please try another image.',
      );
    } finally {
      setWorking(false);
    }
  }

  function cancelEdit() {
    setDisplayName(profile?.display_name ?? '');
    setHandle(profile?.handle ?? '');
    setBio(profile?.bio ?? '');
    setActionError(null);
    setEditing(false);
  }

  if (loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton height={wide ? 176 : 132} radius={theme.radius.lg} />
        <VadSkeleton width={compact ? 72 : 84} height={compact ? 72 : 84} radius={42} />
        <VadSkeleton width="48%" height={28} />
        <VadSkeleton height={82} />
      </View>
    );
  }

  if (loadError && !profile) {
    return (
      <VadErrorState
        title="Profile unavailable"
        message={loadError}
        onRetry={() => {
          setLoading(true);
          void load();
        }}
      />
    );
  }

  const banner = profileMediaUrl(profile?.banner_path);
  const publicName =
    profile?.display_name || profile?.handle || 'VAD member';
  const avatarSize = compact ? 72 : 84;

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.lg }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change profile banner"
          onPress={() => void choose('banner')}
          disabled={working}
          style={({ pressed }) => ({
            height: wide ? 176 : 132,
            overflow: 'hidden',
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.brandSoft,
            opacity: working ? 0.5 : pressed ? 0.78 : 1,
          })}
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
                justifyContent: 'flex-end',
                padding: theme.spacing.md,
                gap: 2,
              }}
            >
              <VadText variant="label" tone="brand">PROFILE BANNER</VadText>
              <VadText variant="caption" tone="secondary">
                Tap to add a recognizable public header.
              </VadText>
            </View>
          )}

          <View
            style={{
              position: 'absolute',
              right: theme.spacing.sm,
              bottom: theme.spacing.sm,
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.md,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
            }}
          >
            <VadText variant="caption">Change banner</VadText>
          </View>
        </Pressable>

        <View
          style={{
            flexDirection: wide ? 'row' : 'column',
            gap: theme.spacing.lg,
            alignItems: wide ? 'flex-end' : 'flex-start',
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            onPress={() => void choose('avatar')}
            disabled={working}
            style={({ pressed }) => ({
              marginTop: wide ? -54 : -46,
              borderWidth: 3,
              borderColor: theme.colors.background,
              borderRadius: theme.radius.pill,
              opacity: working ? 0.5 : pressed ? 0.75 : 1,
            })}
          >
            <ProfileAvatar
              path={profile?.avatar_path}
              name={publicName}
              size={avatarSize}
            />
          </Pressable>

          <View style={{ flex: 1, width: '100%', gap: theme.spacing.xs }}>
            <View
              style={{
                flexDirection: 'row',
                gap: theme.spacing.md,
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <VadText variant="title">{publicName}</VadText>
                <VadText variant="caption" tone="secondary">
                  @{profile?.handle || 'member'}
                </VadText>
              </View>

              <VadButton
                label={editing ? 'Cancel' : 'Edit profile'}
                variant="secondary"
                fullWidth={false}
                size="small"
                disabled={working}
                onPress={editing ? cancelEdit : () => setEditing(true)}
              />
            </View>

            {!editing ? (
              profile?.bio ? (
                <VadText tone="secondary">{profile.bio}</VadText>
              ) : (
                <VadText variant="caption" tone="secondary">
                  Add a short bio so people understand the perspective behind
                  your convictions.
                </VadText>
              )
            ) : null}
          </View>
        </View>
      </View>

      {successMessage ? (
        <InlineStatus
          tone="yes"
          title="Saved"
          message={successMessage}
          onDismiss={() => setSuccessMessage(null)}
        />
      ) : null}

      {actionError ? (
        <InlineStatus
          tone="danger"
          title="Update failed"
          message={actionError}
          onDismiss={() => setActionError(null)}
        />
      ) : null}

      {editing ? (
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: theme.spacing.xs }}>
            <VadText variant="label" tone="brand">PUBLIC IDENTITY</VadText>
            <VadText variant="heading">Edit how people see you.</VadText>
            <VadText variant="caption" tone="secondary">
              These details appear on creator posts, market discussions and
              comments.
            </VadText>
          </View>

          <View
            style={{
              flexDirection: wide ? 'row' : 'column',
              gap: theme.spacing.md,
            }}
          >
            <View style={{ flex: 1 }}>
              <VadInput
                label="Display name"
                value={displayName}
                onChangeText={(value) => {
                  setDisplayName(value);
                  setActionError(null);
                }}
                placeholder="Your public name"
                returnKeyType="next"
              />
            </View>

            <View style={{ flex: 1 }}>
              <VadInput
                label="Handle"
                value={handle}
                onChangeText={(value) => {
                  setHandle(value);
                  setActionError(null);
                }}
                placeholder="yourhandle"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>
          </View>

          <VadInput
            label="Bio"
            value={bio}
            onChangeText={(value) => {
              setBio(value);
              setActionError(null);
            }}
            placeholder="What should people know about your perspective?"
            multiline
            hint={
              bio.trim()
                ? bio.trim().length + ' characters'
                : 'Optional'
            }
          />

          <View
            style={{
              flexDirection: compact ? 'column' : 'row',
              gap: theme.spacing.sm,
            }}
          >
            <VadButton
              label="Cancel"
              variant="secondary"
              disabled={working}
              onPress={cancelEdit}
              style={{ flex: 1 }}
            />
            <VadButton
              label="Save changes"
              loading={working}
              disabled={!displayName.trim() && !handle.trim()}
              onPress={() => void save()}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ gap: 2 }}>
            <VadText variant="heading">Profile media</VadText>
            <VadText variant="caption" tone="secondary">
              Update your photo or banner without changing public details.
            </VadText>
          </View>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
            }}
          >
            <MediaAction
              label="Profile photo"
              detail="Change your creator avatar"
              onPress={() => void choose('avatar')}
              disabled={working}
            />
            <MediaAction
              label="Banner"
              detail="Change your public profile header"
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
  detail,
  onPress,
  disabled,
}: {
  label: string;
  detail: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        paddingVertical: theme.spacing.sm,
        opacity: disabled ? 0.5 : pressed ? 0.65 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <VadText variant="bodyStrong">{label}</VadText>
        <VadText variant="caption" tone="secondary">{detail}</VadText>
      </View>

      <VadText variant="label" tone="brand">Change</VadText>
    </Pressable>
  );
}

function InlineStatus({
  tone,
  title,
  message,
  onDismiss,
}: {
  tone: 'yes' | 'danger';
  title: string;
  message: string;
  onDismiss: () => void;
}) {
  const theme = useVadTheme();
  const positive = tone === 'yes';

  return (
    <View
      style={{
        borderLeftWidth: 3,
        borderLeftColor: positive
          ? theme.colors.yes
          : theme.colors.danger,
        backgroundColor: positive
          ? theme.colors.yesSoft
          : theme.colors.noSoft,
        padding: theme.spacing.md,
        gap: theme.spacing.xs,
      }}
    >
      <VadText variant="caption" tone={tone}>{title.toUpperCase()}</VadText>
      <VadText variant="caption" tone="secondary">{message}</VadText>
      <VadButton
        label="Dismiss"
        variant="ghost"
        size="small"
        fullWidth={false}
        onPress={onDismiss}
      />
    </View>
  );
}
