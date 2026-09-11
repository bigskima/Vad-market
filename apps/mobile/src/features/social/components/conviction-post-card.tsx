import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, Share, View } from 'react-native';

import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon, type VadIconName } from '@/components/ui/vad-icon';
import { VadMediaContainer } from '@/components/ui/vad-media-container';
import { VadText } from '@/components/ui/vad-text';
import { MarketProbabilityBar } from '@/features/markets/components/market-probability-bar';
import { pct } from '@/features/markets/format';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import type { ConvictionPost } from '@/services/social-api';

export function ConvictionPostCard({
  post,
  linkedMarket,
  commentsOpen,
  creatorOpen,
  followDisabled = false,
  likeDisabled = false,
  onFollow,
  onLike,
  onComments,
  onOpenMarket,
  onOpenCreator,
  children,
}: {
  post: ConvictionPost;
  linkedMarket?: MarketCatalogItem;
  commentsOpen: boolean;
  creatorOpen: boolean;
  followDisabled?: boolean;
  likeDisabled?: boolean;
  onFollow: () => void;
  onLike: () => void;
  onComments: () => void;
  onOpenMarket: () => void;
  onOpenCreator: () => void;
  children?: ReactNode;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const authorName = post.author_display_name ?? post.author_handle ?? 'VAD creator';
  const stance = post.stance_outcome_code === 'YES' || post.stance_outcome_code === 'NO' ? post.stance_outcome_code : null;
  const postType = post.post_type.replaceAll('_', ' ');
  const creatorNavigable = Boolean(post.author_handle);
  const bookmarkKey = `vad:bookmark:${post.post_public_id}`;
  const [bookmarked, setBookmarked] = useState(() => {
    try {
      return globalThis.localStorage?.getItem(bookmarkKey) === '1';
    } catch {
      return false;
    }
  });
  const remoteMedia = post.media_path && /^https?:\/\//i.test(post.media_path) ? post.media_path : null;
  const mediaType = post.post_type === 'SHORT_VIDEO' ? 'video' as const : 'image' as const;

  function toggleBookmark() {
    const next = !bookmarked;
    setBookmarked(next);
    try {
      if (next) globalThis.localStorage?.setItem(bookmarkKey, '1');
      else globalThis.localStorage?.removeItem(bookmarkKey);
    } catch {
      // Bookmark remains available for the mounted session.
    }
  }

  async function sharePost() {
    await Share.share({
      title: post.market_title ?? 'VAD post',
      message: `${post.body}${post.market_title ? `\n\nMarket: ${post.market_title}` : ''}`,
    });
  }

  return (
    <VadCard variant="raised" style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Pressable
          accessibilityRole={creatorNavigable ? 'button' : undefined}
          accessibilityLabel={creatorNavigable ? `Open ${authorName} profile` : undefined}
          disabled={!creatorNavigable}
          onPress={onOpenCreator}
          hitSlop={4}
          style={({ pressed }) => ({ opacity: pressed && creatorNavigable ? 0.7 : 1 })}
        >
          <ProfileAvatar path={post.author_avatar_path} name={authorName} size={density.compact ? 38 : 42} />
        </Pressable>

        <Pressable
          accessibilityRole={creatorNavigable ? 'button' : undefined}
          accessibilityLabel={creatorNavigable ? `Open ${authorName} profile` : undefined}
          disabled={!creatorNavigable}
          onPress={onOpenCreator}
          style={({ pressed }) => ({ flex: 1, minWidth: 0, gap: 1, opacity: pressed && creatorNavigable ? 0.7 : 1 })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <VadText variant="bodyStrong" tone={creatorOpen ? 'brand' : 'primary'} numberOfLines={1}>
              {authorName}
            </VadText>
            <View style={{ minHeight: 24, justifyContent: 'center', paddingHorizontal: 8, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceMuted }}>
              <VadText variant="caption" tone="tertiary" numberOfLines={1}>{postType}</VadText>
            </View>
          </View>
          <VadText variant="caption" tone="secondary" numberOfLines={1}>
            {post.author_handle ? `@${post.author_handle}` : 'Username not set'} · {new Date(post.created_at).toLocaleDateString()}
          </VadText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={post.viewer_follows_author ? `Unfollow ${authorName}` : `Follow ${authorName}`}
          accessibilityState={{ selected: post.viewer_follows_author, disabled: followDisabled, busy: followDisabled }}
          disabled={followDisabled}
          onPress={onFollow}
          style={({ pressed }) => ({
            minWidth: 44,
            minHeight: 44,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: theme.spacing.sm,
            borderRadius: theme.radius.pill,
            backgroundColor: post.viewer_follows_author ? theme.colors.surface : theme.colors.brandSoft,
            borderWidth: 1,
            borderColor: post.viewer_follows_author ? theme.colors.border : theme.colors.brandPrimary,
            opacity: followDisabled ? 0.5 : pressed ? 0.65 : 1,
          })}
        >
          <VadText variant="caption" tone={post.viewer_follows_author ? 'secondary' : 'brand'}>
            {post.viewer_follows_author ? 'Following' : 'Follow'}
          </VadText>
        </Pressable>
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <VadText style={{ fontSize: density.compact ? 14 : 15, lineHeight: density.compact ? 20 : 23 }}>
          {post.body}
        </VadText>
        {post.confidence != null ? (
          <View style={{ alignSelf: 'flex-start', minHeight: 30, justifyContent: 'center', paddingHorizontal: 10, borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandSoft }}>
            <VadText variant="caption" tone="brand">Confidence {pct(post.confidence)}</VadText>
          </View>
        ) : null}
      </View>

      {remoteMedia ? (
        <VadMediaContainer
          items={[{ uri: remoteMedia, type: mediaType, alt: 'Community post media' }]}
        />
      ) : post.media_path ? (
        <View style={{ minHeight: 96, justifyContent: 'center', alignItems: 'center', gap: theme.spacing.xs, borderRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }}>
          <VadIcon name="activity" size={24} tone="tertiary" />
          <VadText variant="caption" tone="tertiary">Media attachment</VadText>
        </View>
      ) : null}

      {post.market_title ? (
        <Pressable
          accessibilityRole={linkedMarket ? 'button' : undefined}
          accessibilityLabel={linkedMarket ? `Open linked market: ${post.market_title}` : undefined}
          onPress={onOpenMarket}
          disabled={!linkedMarket}
          style={({ pressed }) => ({
            borderRadius: theme.radius.xl,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: stance === 'NO' ? theme.colors.no : stance === 'YES' ? theme.colors.yes : theme.colors.border,
            padding: density.compact ? 10 : theme.spacing.md,
            gap: density.compact ? 6 : theme.spacing.xs,
            opacity: pressed && linkedMarket ? 0.72 : 1,
          })}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <VadText variant="caption" tone="tertiary">LINKED MARKET{post.asset_code ? ` · ${post.asset_code}` : ''}</VadText>
              <VadText variant="bodyStrong" numberOfLines={density.compact ? 2 : 3}>{post.market_title}</VadText>
            </View>
            {stance ? <VadChip label={stance} tone={stance === 'YES' ? 'yes' : 'no'} /> : null}
          </View>

          <MarketProbabilityBar yes={post.yes_price} no={post.no_price} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
            <VadText variant="caption" tone="secondary">{linkedMarket ? 'Current market price' : 'Market'}</VadText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <VadText variant="caption" tone={linkedMarket ? 'brand' : 'tertiary'}>{linkedMarket ? 'Open market' : 'Unavailable'}</VadText>
              {linkedMarket ? <VadIcon name="chevronRight" size={13} tone="brand" /> : null}
            </View>
          </View>
        </Pressable>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm }}>
        <Action icon="activity" label="Like" count={Number(post.reaction_count)} active={post.viewer_liked} disabled={likeDisabled} onPress={onLike} />
        <Action icon="reply" label="Reply" count={Number(post.comment_count)} active={commentsOpen} onPress={onComments} />
        <Action icon="share" label="Share" active={false} onPress={() => void sharePost()} />
        <Action icon="bookmark" label="Save" active={bookmarked} onPress={toggleBookmark} compact />
      </View>

      {children}
    </VadCard>
  );
}

function Action({
  icon,
  label,
  count,
  active,
  disabled = false,
  compact = false,
  onPress,
}: {
  icon: VadIconName;
  label: string;
  count?: number;
  active: boolean;
  disabled?: boolean;
  compact?: boolean;
  onPress: () => void;
}) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count != null ? `${label}, ${count}` : label}
      accessibilityState={{ selected: active, disabled, busy: disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: compact ? 0 : 1,
        minWidth: compact ? 44 : 0,
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingHorizontal: compact ? 8 : 6,
        borderRadius: theme.radius.pill,
        backgroundColor: active ? theme.colors.brandSoft : pressed ? theme.colors.surfaceMuted : 'transparent',
        opacity: disabled ? 0.5 : pressed ? 0.68 : 1,
      })}
    >
      <VadIcon name={icon} size={16} tone={active ? 'brand' : 'tertiary'} />
      {!compact ? <VadText variant="caption" tone={active ? 'brand' : 'secondary'}>{label}</VadText> : null}
      {count != null ? <VadText variant="caption" tone={active ? 'brand' : 'tertiary'}>{count}</VadText> : null}
    </Pressable>
  );
}
