import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';
import {
  addPostComment,
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
  const [posts, setPosts] = useState<ConvictionPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [body, setBody] = useState('');
  const [market, setMarket] = useState<MarketCatalogItem | null>(null);
  const [stance, setStance] = useState<'YES' | 'NO' | null>(null);
  const [working, setWorking] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');

  const load = useCallback(async () => {
    setFeedError(null);

    try {
      setPosts(await getConvictionFeed());
    } catch (error) {
      setFeedError(
        error instanceof Error
          ? error.message
          : 'Community activity could not be loaded.',
      );
    } finally {
      setPostsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);

    return () => clearTimeout(timer);
  }, [load]);

  const filteredPosts = useMemo(
    () =>
      marketFilter
        ? posts.filter(
            (post) =>
              post.instrument_public_id ===
              marketFilter.instrument_public_id,
          )
        : posts,
    [marketFilter, posts],
  );

  const visiblePosts = useMemo(
    () =>
      typeof maxPosts === 'number'
        ? filteredPosts.slice(0, Math.max(0, maxPosts))
        : filteredPosts,
    [filteredPosts, maxPosts],
  );

  const selectedMarket = marketFilter ?? market;

  async function publish() {
    if (!body.trim()) return;

    setWorking(true);
    try {
      await publishConvictionPost({
        body: body.trim(),
        postType:
          selectedMarket && stance ? 'PREDICTION' : 'ANALYSIS',
        instrumentPublicId:
          selectedMarket?.instrument_public_id ?? null,
        stanceOutcomeCode: stance,
      });

      setBody('');
      setMarket(null);
      setStance(null);
      setComposerOpen(false);
      await load();
    } catch (error) {
      Alert.alert(
        'Post not published',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setWorking(false);
    }
  }

  async function toggleLike(post: ConvictionPost) {
    const wasLiked = post.viewer_liked;
    const previousCount = Number(post.reaction_count);

    setPosts((current) =>
      current.map((item) =>
        item.post_public_id === post.post_public_id
          ? {
              ...item,
              viewer_liked: !wasLiked,
              reaction_count: Math.max(
                0,
                previousCount + (wasLiked ? -1 : 1),
              ),
            }
          : item,
      ),
    );

    try {
      await togglePostLike(post.post_public_id);
      void load();
    } catch (error) {
      setPosts((current) =>
        current.map((item) =>
          item.post_public_id === post.post_public_id
            ? {
                ...item,
                viewer_liked: wasLiked,
                reaction_count: previousCount,
              }
            : item,
        ),
      );

      Alert.alert(
        'Like not updated',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  }

  async function toggleFollow(post: ConvictionPost) {
    const wasFollowing = post.viewer_follows_author;

    setPosts((current) =>
      current.map((item) =>
        item.author_user_id === post.author_user_id
          ? {
              ...item,
              viewer_follows_author: !wasFollowing,
            }
          : item,
      ),
    );

    try {
      await toggleCreatorFollow(post.author_user_id);
      void load();
    } catch (error) {
      setPosts((current) =>
        current.map((item) =>
          item.author_user_id === post.author_user_id
            ? {
                ...item,
                viewer_follows_author: wasFollowing,
              }
            : item,
        ),
      );

      Alert.alert(
        'Follow not updated',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  }

  async function openComments(post: ConvictionPost) {
    setCommentsPostId(post.post_public_id);
    setComments([]);
    setCommentBody('');
    setCommentsError(null);
    setCommentsLoading(true);

    try {
      setComments(await getPostComments(post.post_public_id));
    } catch (error) {
      setCommentsError(
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setCommentsLoading(false);
    }
  }

  async function submitComment(post: ConvictionPost) {
    if (!commentBody.trim()) return;

    setWorking(true);
    try {
      await addPostComment(
        post.post_public_id,
        commentBody.trim(),
      );
      setCommentBody('');
      setPosts((current) =>
        current.map((item) =>
          item.post_public_id === post.post_public_id
            ? {
                ...item,
                comment_count: Number(item.comment_count) + 1,
              }
            : item,
        ),
      );
      setComments(await getPostComments(post.post_public_id));
      void load();
    } catch (error) {
      Alert.alert(
        'Comment not posted',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setWorking(false);
    }
  }

  const commentsPost =
    posts.find((post) => post.post_public_id === commentsPostId) ?? null;

  return (
    <View style={{ gap: theme.spacing.md }}>
      {showComposer && canCreatePost ? (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <VadText variant="bodyStrong">
              {marketFilter ? 'Market discussion' : 'Community feed'}
            </VadText>
            <VadText variant="caption" tone="secondary">
              {marketFilter
                ? 'Add reasoning or publish a market prediction.'
                : 'Share analysis, or attach a live market when you are making a prediction.'}
            </VadText>
          </View>

          <VadButton
            label={composerOpen ? 'Close' : 'New post'}
            fullWidth={false}
            size="small"
            variant={composerOpen ? 'ghost' : 'secondary'}
            onPress={() => setComposerOpen((value) => !value)}
          />
        </View>
      ) : null}

      {showComposer && composerOpen ? (
        <ConvictionComposer
          markets={markets}
          marketFilter={marketFilter}
          selectedMarket={selectedMarket}
          body={body}
          stance={stance}
          working={working}
          onBodyChange={setBody}
          onMarketChange={(nextMarket) => {
            setMarket(nextMarket);
            setStance(null);
          }}
          onStanceChange={setStance}
          onPublish={() => void publish()}
        />
      ) : null}

      {feedError && visiblePosts.length ? (
        <VadErrorState
          title="Community refresh failed"
          message={feedError}
          onRetry={() => void load()}
        />
      ) : null}

      {postsLoading ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadSkeleton height={86} />
          <VadSkeleton height={112} />
          <VadSkeleton height={86} />
        </View>
      ) : feedError && !visiblePosts.length ? (
        <VadErrorState
          title="Community unavailable"
          message={feedError}
          onRetry={() => {
            setPostsLoading(true);
            void load();
          }}
        />
      ) : !visiblePosts.length ? (
        <VadEmptyState
          title={
            marketFilter ? 'No discussion yet' : 'No creator posts yet'
          }
          body={
            marketFilter
              ? 'Be the first to add reasoning or a prediction to this market.'
              : 'The first conviction can start a discussion without creating a duplicate financial market.'
          }
        />
      ) : (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
          }}
        >
          {visiblePosts.map((post) => {
            const linked = post.instrument_public_id
              ? markets.find(
                  (item) =>
                    item.instrument_public_id ===
                    post.instrument_public_id,
                )
              : undefined;

            const commentsOpen =
              commentsPostId === post.post_public_id;

            return (
              <ConvictionPostCard
                key={post.post_public_id}
                post={post}
                linkedMarket={linked}
                commentsOpen={commentsOpen}
                creatorOpen={false}
                onFollow={() => void toggleFollow(post)}
                onLike={() => void toggleLike(post)}
                onComments={() => void openComments(post)}
                onOpenCreator={() =>
                  router.push('/creator/' + post.author_user_id)
                }
                onOpenMarket={() => linked && onOpenMarket(linked)}
              />
            );
          })}
        </View>
      )}

      <VadBottomSheet
        visible={Boolean(commentsPost)}
        title="Discussion"
        onClose={() => {
          setCommentsPostId(null);
          setComments([]);
          setCommentsError(null);
          setCommentsLoading(false);
          setCommentBody('');
        }}
      >
        <ScrollView
          style={{ maxHeight: 380 }}
          contentContainerStyle={{ gap: theme.spacing.sm }}
          keyboardShouldPersistTaps="handled"
        >
          {commentsLoading ? (
            <View style={{ gap: theme.spacing.sm }}>
              <VadSkeleton height={58} />
              <VadSkeleton height={58} />
              <VadSkeleton height={58} />
            </View>
          ) : commentsError ? (
            <VadErrorState
              title="Discussion unavailable"
              message={commentsError}
              onRetry={() => commentsPost && void openComments(commentsPost)}
            />
          ) : comments.length ? (
            comments.map((comment) => {
              const authorName =
                comment.author_display_name ??
                comment.author_handle ??
                'VAD member';

              return (
                <View
                  key={comment.comment_public_id}
                  style={{
                    flexDirection: 'row',
                    gap: theme.spacing.sm,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                    paddingBottom: theme.spacing.sm,
                  }}
                >
                  <ProfileAvatar
                    path={comment.author_avatar_path}
                    name={authorName}
                    size={34}
                  />

                  <View
                    style={{
                      flex: 1,
                      gap: theme.spacing.xxs,
                    }}
                  >
                    <VadText variant="label">{authorName}</VadText>
                    <VadText>{comment.body}</VadText>
                    <VadText variant="caption" tone="secondary">
                      {new Date(
                        comment.created_at,
                      ).toLocaleString()}
                    </VadText>
                  </View>
                </View>
              );
            })
          ) : (
            <VadText tone="secondary">
              No comments yet. Add to the discussion.
            </VadText>
          )}

          {commentsPost && !commentsLoading && !commentsError ? (
            <View style={{ gap: theme.spacing.xs }}>
              <VadInput
                value={commentBody}
                onChangeText={setCommentBody}
                placeholder="Add to the discussion…"
              />
              <VadButton
                label="Send comment"
                disabled={!commentBody.trim()}
                loading={working}
                onPress={() => void submitComment(commentsPost)}
              />
            </View>
          ) : null}
        </ScrollView>
      </VadBottomSheet>
    </View>
  );
}
