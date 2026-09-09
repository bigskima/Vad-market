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

  return <VadCard style={{ gap: theme.spacing.md, borderRadius: theme.radius.xl }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <Pressable onPress={onOpenCreator}><ProfileAvatar path={post.author_avatar_path} name={authorName} size={46} /></Pressable>
      <Pressable onPress={onOpenCreator} style={{ flex: 1, gap: theme.spacing.xxs }}>
        <VadText variant="bodyStrong" tone={creatorOpen ? 'brand' : 'primary'}>{authorName}</VadText>
        <VadText variant="caption" tone="secondary">@{post.author_handle ?? 'member'} · {new Date(post.created_at).toLocaleDateString()}</VadText>
      </Pressable>
      <Pressable onPress={onFollow} style={{ borderRadius: theme.radius.pill, backgroundColor: post.viewer_follows_author ? theme.colors.surfaceMuted : theme.colors.brandSoft, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}><VadText variant="caption" tone={post.viewer_follows_author ? 'secondary' : 'brand'}>{post.viewer_follows_author ? 'Following' : 'Follow'}</VadText></Pressable>
    </View>

    <VadText>{post.body}</VadText>

    {post.market_title ? <Pressable onPress={onOpenMarket} disabled={!linkedMarket}><VadCard variant="muted" style={{ gap: theme.spacing.sm, borderRadius: theme.radius.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
        <VadText variant="bodyStrong" style={{ flex: 1 }}>{post.market_title}</VadText>
        {stance ? <View style={{ borderRadius: theme.radius.pill, backgroundColor: stance === 'YES' ? theme.colors.yesSoft : theme.colors.noSoft, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xxs }}><VadText variant="caption" tone={stance === 'YES' ? 'yes' : 'no'}>{stance}</VadText></View> : null}
      </View>
      <MarketProbabilityBar yes={post.yes_price} no={post.no_price} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        {post.confidence != null ? <VadText variant="caption" tone="secondary">Creator confidence {pct(post.confidence)}</VadText> : <VadText variant="caption" tone="secondary">Market-linked conviction</VadText>}
        <VadText variant="caption" tone="brand">Open market →</VadText>
      </View>
    </VadCard></Pressable> : null}

    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm }}>
      <Pressable onPress={onLike} hitSlop={8}><VadText variant="caption" tone={post.viewer_liked ? 'brand' : 'secondary'}>♥ {Number(post.reaction_count)}</VadText></Pressable>
      <Pressable onPress={onComments} hitSlop={8}><VadText variant="caption" tone={commentsOpen ? 'brand' : 'secondary'}>◯ {Number(post.comment_count)} comments</VadText></Pressable>
      <View style={{ flex: 1 }} />
      <VadText variant="caption" tone="tertiary">{post.post_type.replaceAll('_', ' ')}</VadText>
    </View>
    {children}
  </VadCard>;
}
