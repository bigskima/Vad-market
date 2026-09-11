import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, View, type DimensionValue } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { pickProfileImage } from '@/lib/profile-image-picker';
import { userFacingErrorMessage } from '@/lib/user-facing-error';
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
  const density = useProductDensity();
  const wide = density.width >= 820;
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
      setLoadError(userFacingErrorMessage(error, 'profile', 'We could not load your profile right now. Please try again.'));
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
      setSuccessMessage('Your public profile has been updated.');
    } catch (error) {
      setActionError(userFacingErrorMessage(error, 'profile', 'We could not save your profile right now. Please try again.'));
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
      setSuccessMessage(kind === 'avatar' ? 'Profile photo updated.' : 'Profile banner updated.');
    } catch (error) {
      setActionError(userFacingErrorMessage(error, 'profile', 'We could not update this image. Please try another image or try again later.'));
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
      <View style={{ gap: theme.spacing.sm }}>
        <VadSkeleton height={density.compact ? 108 : 128} radius={density.cardRadius} />
        <VadSkeleton height={88} radius={density.cardRadius} />
        <VadSkeleton height={88} radius={density.cardRadius} />
      </View>
    );
  }

  if (loadError && !profile) {
    return <VadErrorState title="Profile unavailable" message={loadError} onRetry={() => { setLoading(true); void load(); }} />;
  }

  const banner = profileMediaUrl(profile?.banner_path);
  const publicName = profile?.display_name || profile?.handle || 'VAD member';
  const avatarSize = density.compact ? 58 : 66;
  const completenessItems = [Boolean(profile?.display_name), Boolean(profile?.handle), Boolean(profile?.bio), Boolean(profile?.avatar_path), Boolean(profile?.banner_path)];
  const completeness = Math.round((completenessItems.filter(Boolean).length / completenessItems.length) * 100);
  const completionWidth = `${completeness}%` as DimensionValue;
  const handleReady = handle.trim().replace(/^@/, '').length >= 2;
  const identityReady = Boolean(displayName.trim() || handleReady);

  return (
    <View style={{ gap: density.sectionGap }}>
      {loadError ? <VadErrorState title="Could not refresh profile" message={loadError} onRetry={() => void load()} /> : null}

      <VadCard style={{ padding: 0, overflow: 'hidden' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change profile banner"
          onPress={() => void choose('banner')}
          disabled={working}
          style={({ pressed }) => ({
            height: wide ? 172 : density.compact ? 96 : 116,
            backgroundColor: theme.colors.brandSoft,
            opacity: working ? 0.5 : pressed ? 0.8 : 1,
          })}
        >
          {banner ? <Image source={{ uri: banner }} resizeMode="cover" style={{ width: '100%', height: '100%' }} /> : (
            <View style={{ flex: 1, justifyContent: 'flex-end', padding: density.cardPadding, gap: 2 }}>
              <VadText variant="caption" tone="brand">PROFILE BANNER</VadText>
              <VadText variant="caption" tone="secondary">Add an optional public header image.</VadText>
            </View>
          )}
          <View style={{ position: 'absolute', right: 10, bottom: 10, backgroundColor: theme.colors.surface, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 10, minHeight: 30, justifyContent: 'center' }}>
            <VadText variant="caption">{profile?.banner_path ? 'Change' : 'Add banner'}</VadText>
          </View>
        </Pressable>

        <View style={{ padding: density.cardPadding, gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              onPress={() => void choose('avatar')}
              disabled={working}
              style={({ pressed }) => ({ opacity: working ? 0.5 : pressed ? 0.75 : 1 })}
            >
              <ProfileAvatar path={profile?.avatar_path} name={publicName} size={avatarSize} />
            </Pressable>

            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <VadText variant="heading" numberOfLines={1}>{publicName}</VadText>
              <VadText variant="caption" tone="secondary" numberOfLines={1}>@{profile?.handle || 'member'}</VadText>
            </View>

            <VadButton label={editing ? 'Cancel' : 'Edit'} variant="secondary" fullWidth={false} size="small" disabled={working} onPress={editing ? cancelEdit : () => setEditing(true)} />
          </View>

          {!editing ? (
            <VadText variant="caption" tone="secondary" numberOfLines={3}>
              {profile?.bio || 'Add a short bio so people know more about you and your perspective.'}
            </VadText>
          ) : null}
        </View>
      </VadCard>

      <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <VadText variant="bodyStrong">Profile completeness</VadText>
            <VadText variant="caption" tone="secondary">Public details only</VadText>
          </View>
          <VadChip label={`${completeness}%`} tone={completeness === 100 ? 'yes' : 'brand'} />
        </View>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: completeness }} style={{ height: 6, backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill, overflow: 'hidden' }}>
          <View style={{ width: completionWidth, height: '100%', backgroundColor: completeness === 100 ? theme.colors.yes : theme.colors.brandPrimary }} />
        </View>
      </VadCard>

      {successMessage ? <InlineStatus tone="yes" title="Saved" message={successMessage} onDismiss={() => setSuccessMessage(null)} /> : null}
      {actionError ? <InlineStatus tone="danger" title="Could not save changes" message={actionError} onDismiss={() => setActionError(null)} /> : null}

      {editing ? (
        <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'flex-start', gap: theme.spacing.md }}>
          <VadCard style={{ flex: 1.2, width: '100%', gap: theme.spacing.md }}>
            <View style={{ gap: 2 }}>
              <VadText variant="caption" tone="brand">PUBLIC PROFILE</VadText>
              <VadText variant="heading">Edit your profile</VadText>
            </View>
            <VadInput label="Display name" value={displayName} onChangeText={(value) => { setDisplayName(value); setActionError(null); }} placeholder="Your public name" returnKeyType="next" />
            <VadInput label="Username" value={handle} onChangeText={(value) => { setHandle(value.replace(/\s/g, '')); setActionError(null); }} placeholder="yourusername" autoCapitalize="none" autoCorrect={false} hint="You can include @. Spaces are removed." error={handle.trim().length > 0 && !handleReady ? 'Use at least 2 characters.' : undefined} />
            <VadInput label="Bio" value={bio} onChangeText={(value) => { setBio(value); setActionError(null); }} placeholder="Tell people a little about yourself" multiline hint={bio.trim() ? `${bio.trim().length} characters` : 'Optional'} />
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <VadButton label="Cancel" variant="secondary" onPress={cancelEdit} style={{ flex: 1 }} />
              <VadButton label="Save" loading={working} disabled={!identityReady} onPress={() => void save()} style={{ flex: 1 }} />
            </View>
          </VadCard>

          <VadCard variant="raised" style={{ flex: 0.8, width: '100%', gap: theme.spacing.xs }}>
            <VadText variant="bodyStrong">Profile checklist</VadText>
            <ChecklistRow label="Display name" complete={Boolean(displayName.trim())} />
            <ChecklistRow label="Username" complete={handleReady} />
            <ChecklistRow label="Bio" complete={Boolean(bio.trim())} optional />
            <ChecklistRow label="Photo" complete={Boolean(profile?.avatar_path)} optional />
            <ChecklistRow label="Banner" complete={Boolean(profile?.banner_path)} optional />
          </VadCard>
        </View>
      ) : (
        <VadCard variant="raised" style={{ gap: 0 }}>
          <VadText variant="bodyStrong" style={{ marginBottom: theme.spacing.xs }}>Profile images</VadText>
          <MediaAction label="Profile photo" detail={profile?.avatar_path ? 'Replace your current photo' : 'Add a profile photo'} actionLabel={profile?.avatar_path ? 'Change' : 'Add'} onPress={() => void choose('avatar')} disabled={working} />
          <MediaAction label="Banner" detail={profile?.banner_path ? 'Replace your current banner' : 'Add a profile banner'} actionLabel={profile?.banner_path ? 'Change' : 'Add'} onPress={() => void choose('banner')} disabled={working} />
        </VadCard>
      )}
    </View>
  );
}

function ChecklistRow({ label, complete, optional = false }: { label: string; complete: boolean; optional?: boolean }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <VadText variant="caption" tone={complete ? 'yes' : 'tertiary'}>{complete ? '✓' : '–'}</VadText>
      <VadText variant="caption" style={{ flex: 1 }}>{label}</VadText>
      <VadText variant="caption" tone={complete ? 'yes' : 'tertiary'}>{complete ? 'DONE' : optional ? 'OPTIONAL' : 'NEEDED'}</VadText>
    </View>
  );
}

function MediaAction({ label, detail, actionLabel, onPress, disabled }: { label: string; detail: string; actionLabel: string; onPress: () => void; disabled: boolean }) {
  const theme = useVadTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${actionLabel} ${label.toLowerCase()}`} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border, opacity: disabled ? 0.5 : pressed ? 0.65 : 1 })}>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <VadText variant="bodyStrong">{label}</VadText>
        <VadText variant="caption" tone="secondary" numberOfLines={1}>{detail}</VadText>
      </View>
      <VadText variant="label" tone="brand">{actionLabel}</VadText>
    </Pressable>
  );
}

function InlineStatus({ tone, title, message, onDismiss }: { tone: 'yes' | 'danger'; title: string; message: string; onDismiss: () => void }) {
  const theme = useVadTheme();
  const positive = tone === 'yes';
  return (
    <VadCard style={{ borderColor: positive ? theme.colors.yes : theme.colors.danger, backgroundColor: positive ? theme.colors.yesSoft : theme.colors.noSoft, gap: theme.spacing.xs }}>
      <VadText variant="caption" tone={tone}>{title.toUpperCase()}</VadText>
      <VadText variant="caption" tone="secondary">{message}</VadText>
      <VadButton label="Dismiss" variant="ghost" size="small" fullWidth={false} onPress={onDismiss} />
    </VadCard>
  );
}
