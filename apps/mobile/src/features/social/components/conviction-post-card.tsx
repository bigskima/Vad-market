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
  const stanceTone = post.stance_outcome_code === 'YES' ? 'yes' : 'no';
  return <VadCard variant="raised" style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <Pressable onPress={onOpenCreator} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: theme.colors.brandSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.brandPrimary }}><VadText variant="bodyStrong" tone="brand">{initial}</VadText></Pressable>
      <Pressable onPress={onOpenCreator} style={{ flex: 1 }}><VadText variant="bodyStrong" tone={creatorOpen ? 'brand' : 'primary'}>{post.author_display_name ?? post.author_handle ?? 'VAD creator'}</VadText><VadText variant="caption" tone="secondary">@{post.author_handle ?? 'member'} · {new Date(post.created_at).toLocaleDateString()}</VadText></Pressable>
      <Pressable onPress={onFollow} style={{ borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: theme.spacing.sm, paddingVertical: 7 }}><VadText variant="caption" tone="brand">{post.viewer_follows_author ? 'Following' : 'Follow'}</VadText></Pressable>
    </View>

    {post.stance_outcome_code ? <View style={{ alignSelf: 'flex-start', borderRadius: 999, backgroundColor: post.stance_outcome_code === 'YES' ? theme.colors.yesSoft : theme.colors.noSoft, paddingHorizontal: theme.spacing.sm, paddingVertical: 6 }}><VadText variant="caption" tone={stanceTone}>CONVICTION · {post.stance_outcome_code}{post.confidence != null ? ` · ${pct(post.confidence)} confidence` : ''}</VadText></View> : null}

    <VadText variant="bodyStrong" style={{ lineHeight: 24 }}>{post.body}</VadText>

    {post.market_title ? <Pressable onPress={onOpenMarket} disabled={!linkedMarket}><VadCard variant="muted" style={{ gap: theme.spacing.sm, borderColor: theme.colors.borderStrong }}><VadText variant="caption" tone="secondary">LINKED MARKET</VadText><VadText variant="bodyStrong">{post.market_title}</VadText><View style={{ flexDirection: 'row', gap: theme.spacing.xs }}><Probability label="YES" value={post.yes_price} tone="yes" /><Probability label="NO" value={post.no_price} tone="no" /></View><VadText variant="caption" tone="brand">Open market →</VadText></VadCard></Pressable> : null}

    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm }}>
      <Pressable onPress={onLike}><VadText variant="caption" tone={post.viewer_liked ? 'brand' : 'secondary'}>♥ {Number(post.reaction_count)}</VadText></Pressable>
      <Pressable onPress={onComments}><VadText variant="caption" tone={commentsOpen ? 'brand' : 'secondary'}>◯ {Number(post.comment_count)} comments</VadText></Pressable>
      <VadText variant="caption" tone="secondary" style={{ marginLeft: 'auto' }}>{post.post_type.replaceAll('_', ' ')}</VadText>
    </View>
    {children}
  </VadCard>;
}

function Probability({ label, value, tone }: { label: string; value: unknown; tone: 'yes' | 'no' }) {
  const theme = useVadTheme();
  const color = tone === 'yes' ? theme.colors.yes : theme.colors.no;
  const soft = tone === 'yes' ? theme.colors.yesSoft : theme.colors.noSoft;
  return <View style={{ flex: 1, borderRadius: theme.radius.sm, backgroundColor: soft, padding: theme.spacing.sm }}><VadText variant="caption" tone={tone}>{label}</VadText><VadText variant="heading" style={{ color }}>{pct(value)}</VadText></View>;
}
