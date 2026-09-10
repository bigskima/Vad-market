import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  useWindowDimensions,
  View,
  type DimensionValue,
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
  const wide = width >= 820;
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
    const timer = setTimeout(() => void load(), 0);
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
        <VadSkeleton height={wide ? 190 : 132} radius={theme.radius.lg} />
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
  const publicName = profile?.display_name || profile?.handle || 'VAD member';
  const avatarSize = compact ? 72 : 88;
  const completenessItems = [
    Boolean(profile?.display_name),
    Boolean(profile?.handle),
    Boolean(profile?.bio),
    Boolean(profile?.avatar_path),
    Boolean(profile?.banner_path),
  ];
  const completeness = Math.round(
    (completenessItems.filter(Boolean).length / completenessItems.length) * 100,
  );
  const completionWidth = `${completeness}%` as DimensionValue;
  const handleReady = handle.trim().replace(/^@/, '').length >= 2;
  const identityReady = Boolean(displayName.trim() || handleReady);

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      {loadError ? (
        <VadErrorState
          title="Profile refresh failed"
          message={loadError}
          onRetry={() => void load()}
        />
      ) : null}

      <View style={{ gap: theme.spacing.lg }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change profile banner"
          onPress={() => void choose('banner')}
          disabled={working}
          style={({ pressed }) => ({
            height: wide ? 190 : 132,
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
                Add a public header image when you want one.
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
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
            }}
          >
            <VadText variant="caption">
              {profile?.banner_path ? 'Change banner' : 'Add banner'}
            </VadText>
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
              marginTop: wide ? -58 : -46,
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
                flexDirection: compact ? 'column' : 'row',
                gap: theme.spacing.md,
                justifyContent: 'space-between',
                alignItems: compact ? 'stretch' : 'flex-start',
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
                fullWidth={compact}
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

      <View
        style={{
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
          paddingVertical: theme.spacing.md,
          gap: theme.spacing.sm,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: theme.spacing.md,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <VadText variant="bodyStrong">Profile completeness</VadText>
            <VadText variant="caption" tone="secondary">
              Based only on the public profile fields you choose to provide.
            </VadText>
          </View>
          <VadText variant="heading" tone={completeness === 100 ? 'yes' : 'brand'}>
            {completeness}%
          </VadText>
        </View>

        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: completeness }}
          style={{
            height: 7,
            backgroundColor: theme.colors.surfaceMuted,
            borderRadius: theme.radius.pill,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: completionWidth,
              height: '100%',
              backgroundColor: theme.colors.brandPrimary,
            }}
          />
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
        <View
          style={{
            flexDirection: wide ? 'row' : 'column',
            alignItems: 'flex-start',
            gap: theme.spacing.xxl,
          }}
        >
          <View style={{ flex: 1.2, width: '100%', gap: theme.spacing.lg }}>
            <View style={{ gap: theme.spacing.xs }}>
              <VadText variant="label" tone="brand">PUBLIC IDENTITY</VadText>
              <VadText variant="heading">Edit how people see you.</VadText>
              <VadText variant="caption" tone="secondary">
                These details can appear on creator posts, market discussions
                and your public profile.
              </VadText>
            </View>

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

            <VadInput
              label="Handle"
              value={handle}
              onChangeText={(value) => {
                setHandle(value.replace(/\s/g, ''));
                setActionError(null);
              }}
              placeholder="yourhandle"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              hint="You can enter the handle with or without @. Spaces are removed."
              error={
                handle.trim().length > 0 && !handleReady
                  ? 'Use at least 2 characters for your handle.'
                  : undefined
              }
            />

            <VadInput
              label="Bio"
              value={bio}
              onChangeText={(value) => {
                setBio(value);
                setActionError(null);
              }}
              placeholder="What should people know about your perspective?"
              multiline
              hint={bio.trim() ? `${bio.trim().length} characters` : 'Optional'}
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
                disabled={!identityReady}
                onPress={() => void save()}
                style={{ flex: 1 }}
              />
            </View>
          </View>

          <View style={{ flex: 0.8, width: '100%', gap: theme.spacing.sm }}>
            <View style={{ gap: 2 }}>
              <VadText variant="heading">Public profile checklist</VadText>
              <VadText variant="caption" tone="secondary">
                Optional media does not block saving your identity.
              </VadText>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
              <ChecklistRow label="Display name" complete={Boolean(displayName.trim())} />
              <ChecklistRow label="Handle" complete={handleReady} />
              <ChecklistRow label="Bio" complete={Boolean(bio.trim())} optional />
              <ChecklistRow label="Profile photo" complete={Boolean(profile?.avatar_path)} optional />
              <ChecklistRow label="Banner" complete={Boolean(profile?.banner_path)} optional />
            </View>
          </View>
        </View>
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ gap: 2 }}>
            <VadText variant="heading">Profile media</VadText>
            <VadText variant="caption" tone="secondary">
              Update your photo or banner without changing public text.
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
              detail={profile?.avatar_path ? 'Replace your current creator avatar' : 'Add a creator avatar'}
              actionLabel={profile?.avatar_path ? 'Change' : 'Add'}
              onPress={() => void choose('avatar')}
              disabled={working}
            />
            <MediaAction
              label="Banner"
              detail={profile?.banner_path ? 'Replace your public profile header' : 'Add a public profile header'}
              actionLabel={profile?.banner_path ? 'Change' : 'Add'}
              onPress={() => void choose('banner')}
              disabled={working}
            />
          </View>
        </View>
      )}
    </View>
  );
}

function ChecklistRow({
  label,
  complete,
  optional = false,
}: {
  label: string;
  complete: boolean;
  optional?: boolean;
}) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        minHeight: 50,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <VadText variant="caption" tone={complete ? 'yes' : 'tertiary'}>
        {complete ? '✓' : '–'}
      </VadText>
      <VadText variant="caption" style={{ flex: 1 }}>{label}</VadText>
      <VadText variant="caption" tone={complete ? 'yes' : 'tertiary'}>
        {complete ? 'SET' : optional ? 'OPTIONAL' : 'NEEDED'}
      </VadText>
    </View>
  );
}

function MediaAction({
  label,
  detail,
  actionLabel,
  onPress,
  disabled,
}: {
  label: string;
  detail: string;
  actionLabel: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${actionLabel} ${label.toLowerCase()}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 68,
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

      <VadText variant="label" tone="brand">{actionLabel}</VadText>
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
      accessibilityRole="alert"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: positive ? theme.colors.yes : theme.colors.danger,
        backgroundColor: positive ? theme.colors.yesSoft : theme.colors.noSoft,
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
