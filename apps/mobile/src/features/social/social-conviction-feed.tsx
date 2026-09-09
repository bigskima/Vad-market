import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { pct } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { addPostComment, getConvictionFeed, getPostComments, publishConvictionPost, toggleCreatorFollow, togglePostLike, type ConvictionPost, type PostComment } from '@/services/social-api';

export function SocialConvictionFeed({ markets, canCreatePost, onOpenMarket }: { markets: MarketCatalogItem[]; canCreatePost: boolean; onOpenMarket: (market: MarketCatalogItem) => void }) {
  const theme = useVadTheme();
  const [posts, setPosts] = useState<ConvictionPost[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [body, setBody] = useState('');
  const [market, setMarket] = useState<MarketCatalogItem | null>(null);
  const [stance, setStance] = useState<'YES' | 'NO' | null>(null);
  const [working, setWorking] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentBody, setCommentBody] = useState('');

  const load = useCallback(async () => { try { setPosts(await getConvictionFeed()); } catch { setPosts([]); } }, []);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);

  async function publish() {
    if (!body.trim()) return;
    setWorking(true);
    try {
      await publishConvictionPost({ body: body.trim(), postType: market && stance ? 'PREDICTION' : 'ANALYSIS', instrumentPublicId: market?.instrument_public_id ?? null, stanceOutcomeCode: stance });
      setBody(''); setMarket(null); setStance(null); setComposerOpen(false); await load();
    } catch (error) { Alert.alert('Post not published', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setWorking(false); }
  }

  async function openComments(post: ConvictionPost) {
    if (commentsPostId === post.post_public_id) { setCommentsPostId(null); setComments([]); return; }
    try { setComments(await getPostComments(post.post_public_id)); setCommentsPostId(post.post_public_id); }
    catch (error) { Alert.alert('Comments unavailable', error instanceof Error ? error.message : 'Please try again.'); }
  }

  async function submitComment(post: ConvictionPost) {
    if (!commentBody.trim()) return;
    setWorking(true);
    try { await addPostComment(post.post_public_id, commentBody.trim()); setCommentBody(''); setComments(await getPostComments(post.post_public_id)); await load(); }
    catch (error) { Alert.alert('Comment not posted', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setWorking(false); }
  }

  return <View style={{ gap: theme.spacing.sm }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm }}>
      <View style={{ flex: 1 }}><VadText variant="heading">Conviction feed</VadText><VadText variant="caption" tone="secondary">Ideas, arguments and market-linked predictions.</VadText></View>
      {canCreatePost ? <VadButton label={composerOpen ? 'Close' : 'Post'} fullWidth={false} variant={composerOpen ? 'ghost' : 'primary'} onPress={() => setComposerOpen((value) => !value)} /> : null}
    </View>

    {composerOpen ? <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
      <VadInput multiline value={body} onChangeText={setBody} placeholder="What do you believe, and why?" />
      <VadText variant="label" tone="secondary">Attach a live market (optional)</VadText>
      <View style={{ gap: theme.spacing.xs }}>{markets.slice(0, 4).map((item) => <Pressable key={item.instrument_public_id} onPress={() => { setMarket(market?.instrument_public_id === item.instrument_public_id ? null : item); setStance(null); }}><VadCard variant={market?.instrument_public_id === item.instrument_public_id ? 'muted' : 'outlined'} style={{ padding: theme.spacing.sm }}><VadText variant="caption" tone={market?.instrument_public_id === item.instrument_public_id ? 'brand' : 'primary'} numberOfLines={2}>{item.title}</VadText></VadCard></Pressable>)}</View>
      {market ? <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}><VadButton fullWidth={false} label={`YES ${pct(market.yes_price)}`} variant={stance === 'YES' ? 'primary' : 'secondary'} onPress={() => setStance('YES')} /><VadButton fullWidth={false} label={`NO ${pct(market.no_price)}`} variant={stance === 'NO' ? 'primary' : 'secondary'} onPress={() => setStance('NO')} /></View> : null}
      <VadButton label="Publish conviction" loading={working} disabled={!body.trim()} onPress={() => void publish()} />
    </VadCard> : null}

    {!posts.length ? <VadCard variant="outlined"><VadText tone="secondary">No creator posts yet. The first conviction can start discussion without creating a duplicate financial market.</VadText></VadCard> : posts.map((post) => {
      const linked = post.instrument_public_id ? markets.find((item) => item.instrument_public_id === post.instrument_public_id) : undefined;
      const commentsOpen = commentsPostId === post.post_public_id;
      return <VadCard key={post.post_public_id} style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}><View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}><VadText variant="label" tone="brand">{(post.author_display_name ?? post.author_handle ?? 'V').slice(0, 1).toUpperCase()}</VadText></View><View style={{ flex: 1 }}><VadText variant="bodyStrong">{post.author_display_name ?? post.author_handle ?? 'VAD creator'}</VadText><VadText variant="caption" tone="secondary">@{post.author_handle ?? 'member'}</VadText></View><Pressable onPress={() => void toggleCreatorFollow(post.author_user_id).then(load)}><VadText variant="label" tone="brand">{post.viewer_follows_author ? 'Following' : 'Follow'}</VadText></Pressable></View>
        <VadText>{post.body}</VadText>
        {post.market_title ? <Pressable onPress={() => linked && onOpenMarket(linked)}><VadCard variant="raised" style={{ gap: theme.spacing.xs }}><VadText variant="bodyStrong">{post.market_title}</VadText><View style={{ flexDirection: 'row', gap: theme.spacing.md }}><VadText variant="label" tone="yes">YES {pct(post.yes_price)}</VadText><VadText variant="label" tone="no">NO {pct(post.no_price)}</VadText>{post.stance_outcome_code ? <VadText variant="caption" tone="secondary">Creator: {post.stance_outcome_code}</VadText> : null}</View></VadCard></Pressable> : null}
        <View style={{ flexDirection: 'row', gap: theme.spacing.lg }}><Pressable onPress={() => void togglePostLike(post.post_public_id).then(load)}><VadText variant="caption" tone={post.viewer_liked ? 'brand' : 'secondary'}>♥ {Number(post.reaction_count)}</VadText></Pressable><Pressable onPress={() => void openComments(post)}><VadText variant="caption" tone={commentsOpen ? 'brand' : 'secondary'}>Comments {Number(post.comment_count)}</VadText></Pressable></View>
        {commentsOpen ? <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>{comments.length ? comments.map((comment) => <View key={comment.comment_public_id} style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: theme.spacing.xs }}><VadText variant="label">{comment.author_display_name ?? comment.author_handle ?? 'VAD member'}</VadText><VadText>{comment.body}</VadText></View>) : <VadText tone="secondary">No comments yet.</VadText>}<VadInput value={commentBody} onChangeText={setCommentBody} placeholder="Add to the discussion…" /><VadButton label="Send comment" disabled={!commentBody.trim()} loading={working} onPress={() => void submitComment(post)} /></VadCard> : null}
      </VadCard>;
    })}
  </View>;
}
