import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadIcon } from '@/components/ui/vad-icon';
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

  return (
    <VadCard variant="raised" style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Open ' + authorName + ' profile'}
          onPress={onOpenCreator}
          hitSlop={4}
        >
          <ProfileAvatar
            path={post.author_avatar_path}
            name={authorName}
            size={density.compact ? 34 : 38}
          />
        </Pressable>

        <Pressable accessibilityRole="button" onPress={onOpenCreator} style={{ flex: 1, gap: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <VadText variant="bodyStrong" tone={creatorOpen ? 'brand' : 'primary'} numberOfLines={1}>
              {authorName}
            </VadText>
            <VadText variant="caption" tone="tertiary" numberOfLines={1}>{postType}</VadText>
          </View>
          <VadText variant="caption" tone="secondary" numberOfLines={1}>
            @{post.author_handle ?? 'member'} · {new Date(post.created_at).toLocaleDateString()}
          </VadText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: post.viewer_follows_author, disabled: followDisabled, busy: followDisabled }}
          disabled={followDisabled}
          onPress={onFollow}
          hitSlop={6}
          style={({ pressed }) => ({
            minHeight: 30,
            justifyContent: 'center',
            paddingHorizontal: 9,
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

      <View style={{ gap: 4 }}>
        <VadText style={{ fontSize: density.compact ? 14 : 15, lineHeight: density.compact ? 20 : 22 }}>
          {post.body}
        </VadText>
        {post.confidence != null ? (
          <VadText variant="caption" tone="secondary">Confidence {pct(post.confidence)}</VadText>
        ) : null}
      </View>

      {post.market_title ? (
        <Pressable
          accessibilityRole={linkedMarket ? 'button' : undefined}
          accessibilityLabel={linkedMarket ? 'Open linked market' : undefined}
          onPress={onOpenMarket}
          disabled={!linkedMarket}
          style={({ pressed }) => ({
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: stance === 'NO' ? theme.colors.no : stance === 'YES' ? theme.colors.yes : theme.colors.border,
            padding: density.compact ? 9 : 11,
            gap: density.compact ? 6 : theme.spacing.xs,
            opacity: pressed && linkedMarket ? 0.72 : 1,
          })}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 1 }}>
              <VadText variant="caption" tone="tertiary">LINKED MARKET</VadText>
              <VadText variant="bodyStrong" numberOfLines={density.compact ? 2 : 3}>{post.market_title}</VadText>
            </View>
            {stance ? <VadChip label={stance} tone={stance === 'YES' ? 'yes' : 'no'} /> : null}
          </View>

          <MarketProbabilityBar yes={post.yes_price} no={post.no_price} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
            <VadText variant="caption" tone="secondary">{linkedMarket ? 'Live probability' : 'Market reference'}</VadText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <VadText variant="caption" tone={linkedMarket ? 'brand' : 'tertiary'}>{linkedMarket ? 'Open' : 'Unavailable'}</VadText>
              {linkedMarket ? <VadIcon name="chevronRight" size={13} tone="brand" /> : null}
            </View>
          </View>
        </Pressable>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Action label="Like" count={Number(post.reaction_count)} active={post.viewer_liked} disabled={likeDisabled} onPress={onLike} />
        <Action label="Discuss" count={Number(post.comment_count)} active={commentsOpen} onPress={onComments} />
      </View>

      {children}
    </VadCard>
  );
}

function Action({ label, count, active, disabled = false, onPress }: { label: string; count: number; active: boolean; disabled?: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled, busy: disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={5}
      style={({ pressed }) => ({
        minHeight: 30,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 9,
        borderRadius: theme.radius.pill,
        backgroundColor: active ? theme.colors.brandSoft : theme.colors.surface,
        borderWidth: 1,
        borderColor: active ? theme.colors.brandPrimary : theme.colors.border,
        opacity: disabled ? 0.5 : pressed ? 0.62 : 1,
      })}
    >
      <VadText variant="caption" tone={active ? 'brand' : 'secondary'}>{label}</VadText>
      <VadText variant="caption" tone={active ? 'brand' : 'tertiary'}>{count}</VadText>
    </Pressable>
  );
}
