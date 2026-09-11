import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import {
  addPostComment,
  addPostReply,
  getConvictionFeed,
  getPostComments,
  publishConvictionPost,
  toggleCreatorFollow,
  togglePostLike,
  type ConvictionPost,
  type PostComment,
} from '@/services/social-api';
import { ConvictionComposer } from './components/conviction-composer';
import { ConvictionPostCard } from './components/conviction-post-card';

export function SocialConvictionFeed({
  markets,
  canCreatePost,
  onOpenMarket,
  marketFilter,
  maxPosts,
  showComposer = true,
}: {
  markets: MarketCatalogItem[];
  canCreatePost: boolean;
  onOpenMarket: (market: MarketCatalogItem) => void;
  marketFilter?: MarketCatalogItem;
  maxPosts?: number;
  showComposer?: boolean;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [posts, setPosts] = useState<ConvictionPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [body, setBody] = useState('');
  const [market, setMarket] = useState<MarketCatalogItem | null>(null);
  const [stance, setStance] = useState<'YES' | 'NO' | null>(null);
  const [composerWorking, setComposerWorking] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentRefreshError, setCommentRefreshError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [commentWorking, setCommentWorking] = useState(false);
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(() => new Set());
  const [composerError, setComposerError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [commentSubmitError, setCommentSubmitError] = useState<string | null>(null);
  const [pendingLikes, setPendingLikes] = useState<Set<string>>(() => new Set());
  const [pendingFollows, setPendingFollows] = useState<Set<string>>(() => new Set());
  const pendingLikeRef = useRef(new Set<string>());
  const pendingFollowRef = useRef(new Set<string>());

  const load = useCallback(async () => {
    setFeedError(null);
    try {
      setPosts(await getConvictionFeed());
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : 'Community activity could not be loaded.');
    } finally {
      setPostsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const filteredPosts = useMemo(
    () => marketFilter ? posts.filter((post) => post.instrument_public_id === marketFilter.instrument_public_id) : posts,
    [marketFilter, posts],
  );
  const visiblePosts = useMemo(
    () => typeof maxPosts === 'number' ? filteredPosts.slice(0, Math.max(0, maxPosts)) : filteredPosts,
    [filteredPosts, maxPosts],
  );
  const selectedMarket = marketFilter ?? market;

  const commentIds = useMemo(() => new Set(comments.map((comment) => comment.comment_public_id)), [comments]);
  const rootComments = useMemo(
    () => comments.filter((comment) => !comment.parent_comment_public_id || !commentIds.has(comment.parent_comment_public_id)),
    [commentIds, comments],
  );
  const childrenByParent = useMemo(() => {
    const grouped = new Map<string, PostComment[]>();
    for (const comment of comments) {
      if (!comment.parent_comment_public_id) continue;
      const items = grouped.get(comment.parent_comment_public_id) ?? [];
      items.push(comment);
      grouped.set(comment.parent_comment_public_id, items);
    }
    return grouped;
  }, [comments]);

  async function publish() {
    if (!body.trim() || composerWorking) return;
    setComposerWorking(true);
    setComposerError(null);
    try {
      await publishConvictionPost({
        body: body.trim(),
        postType: selectedMarket && stance ? 'PREDICTION' : 'ANALYSIS',
        instrumentPublicId: selectedMarket?.instrument_public_id ?? null,
        stanceOutcomeCode: stance,
      });
      setBody('');
      setMarket(null);
      setStance(null);
      setComposerOpen(false);
      await load();
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setComposerWorking(false);
    }
  }

  async function toggleLike(post: ConvictionPost) {
    const postId = post.post_public_id;
    if (pendingLikeRef.current.has(postId)) return;
    pendingLikeRef.current.add(postId);
    setPendingLikes((current) => new Set(current).add(postId));
    const wasLiked = post.viewer_liked;
    const previousCount = Number(post.reaction_count);
    const optimisticLiked = !wasLiked;
    setPosts((current) => current.map((item) => item.post_public_id === postId ? { ...item, viewer_liked: optimisticLiked, reaction_count: Math.max(0, previousCount + (optimisticLiked ? 1 : 0) - (wasLiked ? 1 : 0)) } : item));
    setActionError(null);
    try {
      const authoritativeLiked = await togglePostLike(postId);
      const authoritativeCount = Math.max(0, previousCount + (authoritativeLiked ? 1 : 0) - (wasLiked ? 1 : 0));
      setPosts((current) => current.map((item) => item.post_public_id === postId ? { ...item, viewer_liked: authoritativeLiked, reaction_count: authoritativeCount } : item));
    } catch (error) {
      setPosts((current) => current.map((item) => item.post_public_id === postId ? { ...item, viewer_liked: wasLiked, reaction_count: previousCount } : item));
      setActionError(error instanceof Error ? error.message : 'The like could not be updated.');
    } finally {
      pendingLikeRef.current.delete(postId);
      setPendingLikes((current) => { const next = new Set(current); next.delete(postId); return next; });
    }
  }

  async function toggleFollow(post: ConvictionPost) {
    const creatorId = post.author_user_id;
    if (pendingFollowRef.current.has(creatorId)) return;
    pendingFollowRef.current.add(creatorId);
    setPendingFollows((current) => new Set(current).add(creatorId));
    const wasFollowing = post.viewer_follows_author;
    setPosts((current) => current.map((item) => item.author_user_id === creatorId ? { ...item, viewer_follows_author: !wasFollowing } : item));
    setActionError(null);
    try {
      const authoritativeFollowing = await toggleCreatorFollow(creatorId);
      setPosts((current) => current.map((item) => item.author_user_id === creatorId ? { ...item, viewer_follows_author: authoritativeFollowing } : item));
    } catch (error) {
      setPosts((current) => current.map((item) => item.author_user_id === creatorId ? { ...item, viewer_follows_author: wasFollowing } : item));
      setActionError(error instanceof Error ? error.message : 'The follow state could not be updated.');
    } finally {
      pendingFollowRef.current.delete(creatorId);
      setPendingFollows((current) => { const next = new Set(current); next.delete(creatorId); return next; });
    }
  }

  async function refreshComments(postPublicId: string) {
    setComments(await getPostComments(postPublicId));
  }

  async function openComments(post: ConvictionPost) {
    setCommentsPostId(post.post_public_id);
    setComments([]);
    setCommentBody('');
    setReplyTo(null);
    setCollapsedThreads(new Set());
    setCommentsError(null);
    setCommentRefreshError(null);
    setCommentSubmitError(null);
    setCommentsLoading(true);
    try {
      await refreshComments(post.post_public_id);
    } catch (error) {
      setCommentsError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setCommentsLoading(false);
    }
  }

  async function submitComment(post: ConvictionPost) {
    if (!commentBody.trim() || commentWorking) return;
    const nextBody = commentBody.trim();
    setCommentWorking(true);
    setCommentSubmitError(null);
    setCommentRefreshError(null);
    try {
      if (replyTo) {
        await addPostReply(post.post_public_id, replyTo.comment_public_id, nextBody);
      } else {
        await addPostComment(post.post_public_id, nextBody);
      }
      setCommentBody('');
      setReplyTo(null);
      setPosts((current) => current.map((item) => item.post_public_id === post.post_public_id ? { ...item, comment_count: Number(item.comment_count) + 1 } : item));
      try {
        await refreshComments(post.post_public_id);
      } catch (refreshError) {
        setCommentRefreshError(refreshError instanceof Error ? `Your comment was posted, but the discussion could not refresh: ${refreshError.message}` : 'Your comment was posted, but the discussion could not refresh.');
      }
    } catch (error) {
      setCommentSubmitError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setCommentWorking(false);
    }
  }

  function toggleThread(commentId: string) {
    setCollapsedThreads((current) => {
      const next = new Set(current);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  }

  const commentsPost = posts.find((post) => post.post_public_id === commentsPostId) ?? null;

  return (
    <View style={{ gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
      {showComposer && canCreatePost ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm }}>
          <View style={{ flex: 1, gap: 1 }}>
            <VadText variant="bodyStrong">{marketFilter ? 'Market discussion' : 'Community feed'}</VadText>
            <VadText variant="caption" tone="secondary" numberOfLines={2}>
              {marketFilter ? 'Add reasoning or publish a market prediction.' : 'Share analysis or attach a live market prediction.'}
            </VadText>
          </View>
          <VadButton label={composerOpen ? 'Close' : 'New post'} fullWidth={false} size="small" variant={composerOpen ? 'ghost' : 'secondary'} onPress={() => setComposerOpen((value) => !value)} />
        </View>
      ) : null}

      {showComposer && composerOpen ? (
        <View style={{ gap: theme.spacing.sm }}>
          <ConvictionComposer
            markets={markets}
            marketFilter={marketFilter}
            selectedMarket={selectedMarket}
            body={body}
            stance={stance}
            working={composerWorking}
            onBodyChange={(value) => { setBody(value); setComposerError(null); }}
            onMarketChange={(nextMarket) => { setMarket(nextMarket); setStance(null); setComposerError(null); }}
            onStanceChange={(nextStance) => { setStance(nextStance); setComposerError(null); }}
            onPublish={() => void publish()}
          />
          {composerError ? <InlineError title="Post not published" message={composerError} onDismiss={() => setComposerError(null)} /> : null}
        </View>
      ) : null}

      {actionError ? <InlineError title="Community action not saved" message={actionError} onDismiss={() => setActionError(null)} /> : null}
      {feedError && visiblePosts.length ? <VadErrorState title="Community refresh failed" message={feedError} onRetry={() => void load()} /> : null}

      {postsLoading ? (
        <View style={{ gap: density.compact ? 6 : theme.spacing.sm }}>
          <VadSkeleton height={density.compact ? 128 : 148} radius={theme.radius.xl} />
          <VadSkeleton height={density.compact ? 152 : 176} radius={theme.radius.xl} />
        </View>
      ) : feedError && !visiblePosts.length ? (
        <VadErrorState title="Community unavailable" message={feedError} onRetry={() => { setPostsLoading(true); void load(); }} />
      ) : !visiblePosts.length ? (
        <VadEmptyState
          title={marketFilter ? 'No discussion yet' : 'No creator posts yet'}
          body={marketFilter ? 'Be the first to add reasoning or a prediction to this market.' : 'The first conviction can start a discussion without creating a duplicate financial market.'}
        />
      ) : (
        <View style={{ gap: density.compact ? 8 : theme.spacing.md }}>
          {visiblePosts.map((post) => {
            const linked = post.instrument_public_id ? markets.find((item) => item.instrument_public_id === post.instrument_public_id) : undefined;
            return (
              <ConvictionPostCard
                key={post.post_public_id}
                post={post}
                linkedMarket={linked}
                commentsOpen={commentsPostId === post.post_public_id}
                creatorOpen={false}
                likeDisabled={pendingLikes.has(post.post_public_id)}
                followDisabled={pendingFollows.has(post.author_user_id)}
                onFollow={() => void toggleFollow(post)}
                onLike={() => void toggleLike(post)}
                onComments={() => void openComments(post)}
                onOpenCreator={() => {
                  if (post.author_handle) router.push('/creator/' + encodeURIComponent(post.author_handle));
                }}
                onOpenMarket={() => linked && onOpenMarket(linked)}
              />
            );
          })}
        </View>
      )}

      <VadBottomSheet
        visible={Boolean(commentsPost)}
        title={commentsPost ? `Discussion · ${Number(commentsPost.comment_count)}` : 'Discussion'}
        onClose={() => {
          setCommentsPostId(null);
          setComments([]);
          setCommentsError(null);
          setCommentRefreshError(null);
          setCommentSubmitError(null);
          setCommentsLoading(false);
          setCommentBody('');
          setReplyTo(null);
          setCollapsedThreads(new Set());
        }}
      >
        <View style={{ gap: theme.spacing.md }}>
          <ScrollView
            style={{ maxHeight: density.short ? 300 : 390 }}
            contentContainerStyle={{ gap: density.compact ? 8 : theme.spacing.sm, paddingBottom: 4 }}
            keyboardShouldPersistTaps="handled"
          >
            {commentsLoading ? (
              <View style={{ gap: 8 }}><VadSkeleton height={76} radius={theme.radius.lg} /><VadSkeleton height={76} radius={theme.radius.lg} /></View>
            ) : commentsError ? (
              <VadErrorState title="Discussion unavailable" message={commentsError} onRetry={() => commentsPost && void openComments(commentsPost)} />
            ) : rootComments.length ? (
              rootComments.map((comment) => (
                <CommentNode
                  key={comment.comment_public_id}
                  comment={comment}
                  childrenByParent={childrenByParent}
                  collapsedThreads={collapsedThreads}
                  depth={0}
                  onReply={(target) => {
                    setReplyTo(target);
                    setCommentBody('');
                    setCommentSubmitError(null);
                  }}
                  onToggle={toggleThread}
                />
              ))
            ) : (
              <VadCard variant="outlined" style={{ minHeight: 84, justifyContent: 'center', alignItems: 'center' }}>
                <VadText tone="secondary">No comments yet. Start the discussion.</VadText>
              </VadCard>
            )}

            {commentRefreshError ? <InlineError title="Discussion refresh delayed" message={commentRefreshError} onDismiss={() => setCommentRefreshError(null)} /> : null}
          </ScrollView>

          {commentsPost && !commentsLoading && !commentsError ? (
            <View style={{ gap: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.md }}>
              {replyTo ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderRadius: theme.radius.lg, backgroundColor: theme.colors.brandSoft, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}>
                  <VadIcon name="reply" size={16} tone="brand" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <VadText variant="caption" tone="brand">Replying to {replyTo.author_display_name ?? replyTo.author_handle ?? 'VAD member'}</VadText>
                    <VadText variant="caption" tone="secondary" numberOfLines={1}>{replyTo.body}</VadText>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cancel reply"
                    onPress={() => setReplyTo(null)}
                    style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
                  >
                    <VadIcon name="close" size={15} tone="secondary" />
                  </Pressable>
                </View>
              ) : null}

              {commentSubmitError ? <InlineError title={replyTo ? 'Reply not posted' : 'Comment not posted'} message={commentSubmitError} onDismiss={() => setCommentSubmitError(null)} /> : null}
              <VadInput
                label={replyTo ? 'Write a reply' : 'Add to the discussion'}
                floatingLabel
                value={commentBody}
                onChangeText={(value) => { setCommentBody(value); setCommentSubmitError(null); }}
                placeholder={replyTo ? 'Reply with context…' : 'Share a useful thought…'}
                multiline
              />
              <VadButton
                label={replyTo ? 'Send reply' : 'Send comment'}
                disabled={!commentBody.trim()}
                loading={commentWorking}
                onPress={() => void submitComment(commentsPost)}
              />
            </View>
          ) : null}
        </View>
      </VadBottomSheet>
    </View>
  );
}

function CommentNode({
  comment,
  childrenByParent,
  collapsedThreads,
  depth,
  onReply,
  onToggle,
}: {
  comment: PostComment;
  childrenByParent: Map<string, PostComment[]>;
  collapsedThreads: Set<string>;
  depth: number;
  onReply: (comment: PostComment) => void;
  onToggle: (commentId: string) => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const authorName = comment.author_display_name ?? comment.author_handle ?? 'VAD member';
  const replies = childrenByParent.get(comment.comment_public_id) ?? [];
  const collapsed = collapsedThreads.has(comment.comment_public_id);
  const visualDepth = Math.min(depth, 3);

  return (
    <View style={{ marginLeft: visualDepth * (density.compact ? 10 : 18) }}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {depth > 0 ? (
          <View style={{ width: 2, borderRadius: 1, backgroundColor: theme.colors.borderStrong, marginRight: density.compact ? 1 : 3 }} />
        ) : null}
        <ProfileAvatar path={comment.author_avatar_path} name={authorName} size={depth > 0 ? 30 : 36} />
        <View style={{ flex: 1, minWidth: 0, gap: theme.spacing.xs }}>
          <View style={{ borderRadius: theme.radius.lg, backgroundColor: depth > 0 ? theme.colors.surfaceRaised : theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.sm, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
              <VadText variant="label" numberOfLines={1} style={{ flex: 1 }}>{authorName}</VadText>
              <VadText variant="caption" tone="tertiary">{new Date(comment.created_at).toLocaleDateString()}</VadText>
            </View>
            <VadText variant="body">{comment.body}</VadText>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onReply(comment)}
              style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: theme.spacing.xs, opacity: pressed ? 0.6 : 1 })}
            >
              <VadIcon name="reply" size={14} tone="tertiary" />
              <VadText variant="caption" tone="brand">Reply</VadText>
            </Pressable>

            {replies.length ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: !collapsed }}
                onPress={() => onToggle(comment.comment_public_id)}
                style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: theme.spacing.xs, opacity: pressed ? 0.6 : 1 })}
              >
                <VadText variant="caption" tone="secondary">
                  {collapsed ? `Show ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : 'Hide replies'}
                </VadText>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      {!collapsed && replies.length ? (
        <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.xs }}>
          {replies.map((reply) => (
            <CommentNode
              key={reply.comment_public_id}
              comment={reply}
              childrenByParent={childrenByParent}
              collapsedThreads={collapsedThreads}
              depth={depth + 1}
              onReply={onReply}
              onToggle={onToggle}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function InlineError({ title, message, onDismiss }: { title: string; message: string; onDismiss: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  return (
    <VadCard variant="raised" style={{ borderColor: theme.colors.danger, gap: 4 }}>
      <VadText variant="caption" tone="danger">{title.toUpperCase()}</VadText>
      <VadText variant="caption" tone="secondary">{message}</VadText>
      <VadButton label="Dismiss" variant="ghost" size="small" fullWidth={false} onPress={onDismiss} style={{ marginTop: density.compact ? 0 : 2 }} />
    </VadCard>
  );
}
