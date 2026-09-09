import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { pct } from '@/features/markets/format';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import { addPostComment, getConvictionFeed, getPostComments, publishConvictionPost, toggleCreatorFollow, togglePostLike, type ConvictionPost, type PostComment } from '@/services/social-api';
import { ConvictionPostCard } from './components/conviction-post-card';

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

  return <View style={{ gap: theme.spacing.md }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm }}>
      <View style={{ flex: 1 }}><VadText variant="heading">Conviction feed</VadText><VadText variant="caption" tone="secondary">Ideas, arguments and market-linked predictions from the network.</VadText></View>
      {canCreatePost ? <VadButton label={composerOpen ? 'Close' : 'Post'} fullWidth={false} variant={composerOpen ? 'ghost' : 'primary'} onPress={() => setComposerOpen((value) => !value)} /> : null}
    </View>

    {composerOpen ? <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
      <View><VadText variant="bodyStrong">Share your conviction</VadText><VadText variant="caption" tone="secondary">Explain the reasoning. Attach a live market only when it is genuinely related.</VadText></View>
      <VadInput multiline value={body} onChangeText={setBody} placeholder="What do you believe, and why?" />
      <VadText variant="label" tone="secondary">Attach a live market (optional)</VadText>
      <View style={{ gap: theme.spacing.xs }}>{markets.slice(0, 4).map((item) => <Pressable key={item.instrument_public_id} onPress={() => { setMarket(market?.instrument_public_id === item.instrument_public_id ? null : item); setStance(null); }}><VadCard variant={market?.instrument_public_id === item.instrument_public_id ? 'muted' : 'outlined'} style={{ padding: theme.spacing.sm }}><VadText variant="caption" tone={market?.instrument_public_id === item.instrument_public_id ? 'brand' : 'primary'} numberOfLines={2}>{item.title}</VadText></VadCard></Pressable>)}</View>
      {market ? <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}><VadButton fullWidth={false} label={`YES ${pct(market.yes_price)}`} variant={stance === 'YES' ? 'primary' : 'secondary'} onPress={() => setStance('YES')} /><VadButton fullWidth={false} label={`NO ${pct(market.no_price)}`} variant={stance === 'NO' ? 'primary' : 'secondary'} onPress={() => setStance('NO')} /></View> : null}
      <VadButton label="Publish conviction" loading={working} disabled={!body.trim()} onPress={() => void publish()} />
    </VadCard> : null}

    {!posts.length ? <VadEmptyState title="No creator posts yet" body="The first conviction can start a discussion without creating a duplicate financial market." /> : posts.map((post) => {
      const linked = post.instrument_public_id ? markets.find((item) => item.instrument_public_id === post.instrument_public_id) : undefined;
      const commentsOpen = commentsPostId === post.post_public_id;
      return <ConvictionPostCard key={post.post_public_id} post={post} linkedMarket={linked} commentsOpen={commentsOpen} onFollow={() => void toggleCreatorFollow(post.author_user_id).then(load)} onLike={() => void togglePostLike(post.post_public_id).then(load)} onComments={() => void openComments(post)} onOpenMarket={() => linked && onOpenMarket(linked)}>
        {commentsOpen ? <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>{comments.length ? comments.map((comment) => <View key={comment.comment_public_id} style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: theme.spacing.xs }}><VadText variant="label">{comment.author_display_name ?? comment.author_handle ?? 'VAD member'}</VadText><VadText>{comment.body}</VadText></View>) : <VadText tone="secondary">No comments yet. Add context without leaving the post.</VadText>}<View style={{ gap: theme.spacing.xs }}><VadInput value={commentBody} onChangeText={setCommentBody} placeholder="Add to the discussion…" /><VadButton label="Send comment" disabled={!commentBody.trim()} loading={working} onPress={() => void submitComment(post)} /></View></VadCard> : null}
      </ConvictionPostCard>;
    })}
  </View>;
}
