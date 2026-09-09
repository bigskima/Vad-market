import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { pct } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import type { ConvictionPost } from '@/services/social-api';

export function ConvictionPostCard({ post, linkedMarket, commentsOpen, creatorOpen, onFollow, onLike, onComments, onOpenMarket, onOpenCreator, children }: { post: ConvictionPost; linkedMarket?: MarketCatalogItem; commentsOpen: boolean; creatorOpen: boolean; onFollow: () => void; onLike: () => void; onComments: () => void; onOpenMarket: () => void; onOpenCreator: () => void; children?: ReactNode }) {
  const theme = useVadTheme();
  const initial = (post.author_display_name ?? post.author_handle ?? 'V').slice(0, 1).toUpperCase();
  return <VadCard style={{ gap: theme.spacing.md }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <Pressable onPress={onOpenCreator} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: theme.colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}><VadText variant="bodyStrong" tone="brand">{initial}</VadText></Pressable>
      <Pressable onPress={onOpenCreator} style={{ flex: 1 }}><VadText variant="bodyStrong" tone={creatorOpen ? 'brand' : 'primary'}>{post.author_display_name ?? post.author_handle ?? 'VAD creator'}</VadText><VadText variant="caption" tone="secondary">@{post.author_handle ?? 'member'} · {new Date(post.created_at).toLocaleDateString()}</VadText></Pressable>
      <Pressable onPress={onFollow}><VadText variant="label" tone="brand">{post.viewer_follows_author ? 'Following' : 'Follow'}</VadText></Pressable>
    </View>

    <VadText>{post.body}</VadText>

    {post.market_title ? <Pressable onPress={onOpenMarket} disabled={!linkedMarket}><VadCard variant="muted" style={{ gap: theme.spacing.xs }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}><VadText variant="bodyStrong" style={{ flex: 1 }}>{post.market_title}</VadText>{post.stance_outcome_code ? <View style={{ borderRadius: 999, backgroundColor: post.stance_outcome_code === 'YES' ? theme.colors.yesSoft : theme.colors.noSoft, paddingHorizontal: 8, paddingVertical: 5 }}><VadText variant="caption" tone={post.stance_outcome_code === 'YES' ? 'yes' : 'no'}>{post.stance_outcome_code}</VadText></View> : null}</View><View style={{ flexDirection: 'row', gap: theme.spacing.lg }}><VadText variant="label" tone="yes">YES {pct(post.yes_price)}</VadText><VadText variant="label" tone="no">NO {pct(post.no_price)}</VadText>{post.confidence != null ? <VadText variant="caption" tone="secondary">Confidence {pct(post.confidence)}</VadText> : null}</View></VadCard></Pressable> : null}

    <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm }}>
      <Pressable onPress={onLike}><VadText variant="caption" tone={post.viewer_liked ? 'brand' : 'secondary'}>♥ {Number(post.reaction_count)}</VadText></Pressable>
      <Pressable onPress={onComments}><VadText variant="caption" tone={commentsOpen ? 'brand' : 'secondary'}>{Number(post.comment_count)} comments</VadText></Pressable>
      <VadText variant="caption" tone="secondary">{post.post_type.replaceAll('_', ' ')}</VadText>
    </View>
    {children}
  </VadCard>;
}
