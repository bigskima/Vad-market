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
import { MarketThumbnail } from '@/features/markets/components/market-thumbnail';
import { MarketTimeStatus } from '@/features/markets/components/market-time-status';
import { pct } from '@/features/markets/format';
import { formatRelativeTimestamp, marketStatusMeta } from '@/features/markets/market-state';
import { useLiveNow } from '@/hooks/use-live-now';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import type { ConvictionPost } from '@/services/social-api';

const LONG_POST_THRESHOLD = 320;

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
  const now = useLiveNow();
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
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const remoteMedia = post.media_path && /^https?:\/\//i.test(post.media_path) ? post.media_path : null;
  const mediaType = post.post_type === 'SHORT_VIDEO' ? 'video' as const : 'image' as const;
  const postAge = formatRelativeTimestamp(post.created_at, now) ?? 'recently';
  const longPost = post.body.trim().length > LONG_POST_THRESHOLD;
  const linkedStatus = linkedMarket ? marketStatusMeta(linkedMarket.status) : null;

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
    <VadCard
      variant="raised"
      style={{
        gap: density.compact ? theme.spacing.sm : theme.spacing.md,
        overflow: 'hidden',
        borderColor: stance === 'YES' ? theme.colors.yes : stance === 'NO' ? theme.colors.no : theme.colors.border,
      }}
    >
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
          <VadText variant="bodyStrong" tone={creatorOpen ? 'brand' : 'primary'} numberOfLines={1}>
            {authorName}
          </VadText>
          <VadText variant="caption" tone="secondary" numberOfLines={1}>
            {post.author_handle ? `@${post.author_handle}` : 'VAD member'} · {postAge}
          </VadText>
        </Pressable>

        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          <VadChip label={postType} tone="neutral" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={post.viewer_follows_author ? `Unfollow ${authorName}` : `Follow ${authorName}`}
            accessibilityState={{ selected: post.viewer_follows_author, disabled: followDisabled, busy: followDisabled }}
            disabled={followDisabled}
            onPress={onFollow}
            style={({ pressed }) => ({
              minHeight: 34,
              justifyContent: 'center',
              paddingHorizontal: 9,
              borderRadius: theme.radius.pill,
              backgroundColor: post.viewer_follows_author ? theme.colors.surface : theme.colors.brandSoft,
              opacity: followDisabled ? 0.5 : pressed ? 0.65 : 1,
            })}
          >
            <VadText variant="caption" tone={post.viewer_follows_author ? 'secondary' : 'brand'}>
              {post.viewer_follows_author ? 'Following' : 'Follow'}
            </VadText>
          </Pressable>
        </View>
      </View>

      {stance || post.confidence != null ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            minHeight: 36,
            paddingHorizontal: 10,
            borderRadius: theme.radius.md,
            backgroundColor: stance === 'YES' ? theme.colors.yesSoft : stance === 'NO' ? theme.colors.noSoft : theme.colors.brandSoft,
          }}
        >
          <VadText variant="caption" tone={stance === 'YES' ? 'yes' : stance === 'NO' ? 'no' : 'brand'}>
            {stance ? `${stance} CONVICTION` : 'CONVICTION'}
          </VadText>
          <View style={{ flex: 1 }} />
          {post.confidence != null ? (
            <VadText variant="caption" tone="secondary">Confidence {pct(post.confidence)}</VadText>
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: 2 }}>
        <VadText
          numberOfLines={longPost && !bodyExpanded ? (density.compact ? 5 : 6) : undefined}
          style={{ fontSize: density.compact ? 14 : 15, lineHeight: density.compact ? 20 : 23 }}
        >
          {post.body}
        </VadText>
        {longPost ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={bodyExpanded ? 'Show less of this post' : 'Read the full post'}
            accessibilityState={{ expanded: bodyExpanded }}
            onPress={() => setBodyExpanded((value) => !value)}
            style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', opacity: pressed ? 0.62 : 1 })}
          >
            <VadText variant="caption" tone="brand">{bodyExpanded ? 'Show less' : 'Read more'}</VadText>
          </Pressable>
        ) : null}
      </View>

      {remoteMedia ? (
        <VadMediaContainer items={[{ uri: remoteMedia, type: mediaType, alt: 'Community post media' }]} />
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
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.background,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: density.compact ? 9 : theme.spacing.sm,
            gap: 7,
            opacity: pressed && linkedMarket ? 0.72 : 1,
          })}
        >
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
            {linkedMarket ? <MarketThumbnail market={linkedMarket} size={density.compact ? 54 : 60} /> : null}
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>LINKED MARKET{post.asset_code ? ` · ${post.asset_code}` : ''}</VadText>
                {linkedStatus ? <VadChip label={linkedStatus.label} tone={linkedStatus.tone} /> : null}
              </View>
              <VadText variant="bodyStrong" numberOfLines={2}>{post.market_title}</VadText>
              {linkedMarket ? <MarketTimeStatus market={linkedMarket} compact fill /> : null}
            </View>
          </View>

          <MarketProbabilityBar yes={post.yes_price} no={post.no_price} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
            <VadText variant="caption" tone="secondary">
              {stance ? `${stance} view · ` : ''}{linkedStatus?.tradeOpen ? 'Live market context' : linkedStatus?.detail ?? 'Market context'}
            </VadText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <VadText variant="caption" tone={linkedMarket ? 'brand' : 'tertiary'}>{linkedMarket ? (linkedStatus?.tradeOpen ? 'Trade' : 'Details') : 'Unavailable'}</VadText>
              {linkedMarket ? <VadIcon name="chevronRight" size={13} tone="brand" /> : null}
            </View>
          </View>
        </Pressable>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 7 }}>
        <Action icon="activity" label="Like" count={Number(post.reaction_count)} active={post.viewer_liked} disabled={likeDisabled} onPress={onLike} />
        <Action icon="reply" label="Discuss" count={Number(post.comment_count)} active={commentsOpen} onPress={onComments} />
        <Action icon="share" label="Share" active={false} onPress={() => void sharePost()} compact />
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
        minWidth: compact ? 42 : 0,
        minHeight: 40,
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
      <VadIcon name={icon} size={15} tone={active ? 'brand' : 'tertiary'} />
      {!compact ? <VadText variant="caption" tone={active ? 'brand' : 'secondary'}>{label}</VadText> : null}
      {count != null ? <VadText variant="caption" tone={active ? 'brand' : 'tertiary'}>{count}</VadText> : null}
    </Pressable>
  );
}
