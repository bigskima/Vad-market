import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { VadText } from '@/components/ui/vad-text';
import { MarketProbabilityBar } from '@/features/markets/components/market-probability-bar';
import { pct } from '@/features/markets/format';
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
  const authorName =
    post.author_display_name ?? post.author_handle ?? 'VAD creator';

  const stance =
    post.stance_outcome_code === 'YES' ||
    post.stance_outcome_code === 'NO'
      ? post.stance_outcome_code
      : null;

  const postType = post.post_type.replaceAll('_', ' ');

  return (
    <View
      style={{
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Open ' + authorName + ' profile'}
          onPress={onOpenCreator}
        >
          <ProfileAvatar
            path={post.author_avatar_path}
            name={authorName}
            size={44}
          />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={onOpenCreator}
          style={{ flex: 1, gap: 2 }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.xs,
              flexWrap: 'wrap',
            }}
          >
            <VadText
              variant="bodyStrong"
              tone={creatorOpen ? 'brand' : 'primary'}
            >
              {authorName}
            </VadText>
            <VadText variant="caption" tone="tertiary">
              {postType}
            </VadText>
          </View>

          <VadText variant="caption" tone="secondary">
            @{post.author_handle ?? 'member'} ·{' '}
            {new Date(post.created_at).toLocaleDateString()}
          </VadText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            selected: post.viewer_follows_author,
            disabled: followDisabled,
            busy: followDisabled,
          }}
          disabled={followDisabled}
          onPress={onFollow}
          hitSlop={8}
          style={({ pressed }) => ({
            minHeight: 34,
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.xs,
            opacity: followDisabled ? 0.5 : pressed ? 0.6 : 1,
          })}
        >
          <VadText
            variant="caption"
            tone={post.viewer_follows_author ? 'secondary' : 'brand'}
          >
            {post.viewer_follows_author ? 'Following' : 'Follow'}
          </VadText>
        </Pressable>
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <VadText style={{ fontSize: 16, lineHeight: 24 }}>
          {post.body}
        </VadText>

        {post.confidence != null ? (
          <VadText variant="caption" tone="secondary">
            Confidence {pct(post.confidence)}
          </VadText>
        ) : null}
      </View>

      {post.market_title ? (
        <Pressable
          accessibilityRole={linkedMarket ? 'button' : undefined}
          accessibilityLabel={
            linkedMarket ? 'Open linked market' : undefined
          }
          onPress={onOpenMarket}
          disabled={!linkedMarket}
          style={({ pressed }) => ({
            borderLeftWidth: 3,
            borderLeftColor: stance === 'NO'
              ? theme.colors.no
              : stance === 'YES'
                ? theme.colors.yes
                : theme.colors.brandPrimary,
            backgroundColor: theme.colors.surfaceRaised,
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.md,
            gap: theme.spacing.sm,
            opacity: pressed && linkedMarket ? 0.72 : 1,
          })}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: theme.spacing.sm,
              alignItems: 'flex-start',
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <VadText variant="caption" tone="tertiary">
                LINKED MARKET
              </VadText>
              <VadText variant="bodyStrong" numberOfLines={3}>
                {post.market_title}
              </VadText>
            </View>

            {stance ? (
              <VadText
                variant="label"
                tone={stance === 'YES' ? 'yes' : 'no'}
              >
                {stance}
              </VadText>
            ) : null}
          </View>

          <MarketProbabilityBar
            yes={post.yes_price}
            no={post.no_price}
          />

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: theme.spacing.sm,
              alignItems: 'center',
            }}
          >
            <VadText variant="caption" tone="secondary">
              {linkedMarket ? 'Live probability' : 'Market reference'}
            </VadText>
            <VadText variant="caption" tone="brand">
              {linkedMarket ? 'Open →' : 'Unavailable'}
            </VadText>
          </View>
        </Pressable>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          gap: theme.spacing.xl,
          alignItems: 'center',
        }}
      >
        <Action
          label="Like"
          count={Number(post.reaction_count)}
          active={post.viewer_liked}
          disabled={likeDisabled}
          onPress={onLike}
        />
        <Action
          label="Discuss"
          count={Number(post.comment_count)}
          active={commentsOpen}
          onPress={onComments}
        />
      </View>

      {children}
    </View>
  );
}

function Action({
  label,
  count,
  active,
  disabled = false,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useVadTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled, busy: disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        minHeight: 34,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
      })}
    >
      <VadText
        variant="caption"
        tone={active ? 'brand' : 'secondary'}
      >
        {label}
      </VadText>
      <VadText
        variant="caption"
        tone={active ? 'brand' : 'tertiary'}
      >
        {count}
      </VadText>
    </Pressable>
  );
}
