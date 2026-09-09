import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { MarketProbabilityBar } from '@/features/markets/components/market-probability-bar';
import { pct } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import type { ConvictionPost } from '@/services/social-api';

export function ConvictionPostCard({ post, linkedMarket, commentsOpen, creatorOpen, onFollow, onLike, onComments, onOpenMarket, onOpenCreator, children }: { post: ConvictionPost; linkedMarket?: MarketCatalogItem; commentsOpen: boolean; creatorOpen: boolean; onFollow: () => void; onLike: () => void; onComments: () => void; onOpenMarket: () => void; onOpenCreator: () => void; children?: ReactNode }) {
  const theme = useVadTheme();
  const authorName = post.author_display_name ?? post.author_handle ?? 'VAD creator';
  const stance = post.stance_outcome_code === 'YES' || post.stance_outcome_code === 'NO' ? post.stance_outcome_code : null;
  const postType = post.post_type.replaceAll('_', ' ');

  return <VadCard style={{ gap: theme.spacing.md, borderRadius: theme.radius.xl, padding: theme.spacing.md }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <Pressable onPress={onOpenCreator}><ProfileAvatar path={post.author_avatar_path} name={authorName} size={46} /></Pressable>

      <Pressable onPress={onOpenCreator} style={{ flex: 1, gap: theme.spacing.xxs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
          <VadText variant="bodyStrong" tone={creatorOpen ? 'brand' : 'primary'}>{authorName}</VadText>
          <VadText variant="caption" tone="tertiary">{postType}</VadText>
        </View>
        <VadText variant="caption" tone="secondary">@{post.author_handle ?? 'member'} · {new Date(post.created_at).toLocaleDateString()}</VadText>
      </Pressable>

      <Pressable
        onPress={onFollow}
        style={{
          minHeight: 34,
          justifyContent: 'center',
          borderRadius: theme.radius.pill,
          borderWidth: 1,
          borderColor: post.viewer_follows_author ? theme.colors.border : theme.colors.brandPrimary,
          backgroundColor: post.viewer_follows_author ? theme.colors.surfaceMuted : theme.colors.brandSoft,
          paddingHorizontal: theme.spacing.sm,
        }}
      >
        <VadText variant="caption" tone={post.viewer_follows_author ? 'secondary' : 'brand'}>{post.viewer_follows_author ? 'Following' : 'Follow'}</VadText>
      </Pressable>
    </View>

    <View style={{ gap: theme.spacing.xs }}>
      <VadText style={{ fontSize: 16, lineHeight: 24 }}>{post.body}</VadText>
      {post.confidence != null ? <VadText variant="caption" tone="secondary">Confidence {pct(post.confidence)}</VadText> : null}
    </View>

    {post.market_title ? <Pressable onPress={onOpenMarket} disabled={!linkedMarket}>
      <VadCard variant="muted" style={{ gap: theme.spacing.sm, borderRadius: theme.radius.lg, padding: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: theme.spacing.xxs }}>
            <VadText variant="caption" tone="secondary">LINKED MARKET</VadText>
            <VadText variant="bodyStrong" numberOfLines={3}>{post.market_title}</VadText>
          </View>

          {stance ? <View style={{ borderRadius: theme.radius.pill, backgroundColor: stance === 'YES' ? theme.colors.yesSoft : theme.colors.noSoft, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}>
            <VadText variant="label" tone={stance === 'YES' ? 'yes' : 'no'}>{stance}</VadText>
          </View> : null}
        </View>

        <MarketProbabilityBar yes={post.yes_price} no={post.no_price} />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
          <VadText variant="caption" tone="secondary">{linkedMarket ? 'Live probability' : 'Market reference'}</VadText>
          <VadText variant="caption" tone="brand">{linkedMarket ? 'Open market →' : 'Unavailable'}</VadText>
        </View>
      </VadCard>
    </Pressable> : null}

    <View style={{ flexDirection: 'row', gap: theme.spacing.xs, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm }}>
      <Action label={`♥ ${Number(post.reaction_count)}`} active={post.viewer_liked} onPress={onLike} />
      <Action label={`◯ ${Number(post.comment_count)}`} active={commentsOpen} onPress={onComments} />
    </View>

    {children}
  </VadCard>;
}

function Action({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return <Pressable
    onPress={onPress}
    hitSlop={8}
    style={{
      minHeight: 34,
      justifyContent: 'center',
      borderRadius: theme.radius.pill,
      backgroundColor: active ? theme.colors.brandSoft : theme.colors.surfaceMuted,
      paddingHorizontal: theme.spacing.sm,
    }}
  >
    <VadText variant="caption" tone={active ? 'brand' : 'secondary'}>{label}</VadText>
  </Pressable>;
}
