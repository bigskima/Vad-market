import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { pct } from '@/features/markets/format';
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
import { ConvictionPostCard } from './components/conviction-post-card';

export function SocialConvictionFeed({
  markets,
  canCreatePost,
  onOpenMarket,
  marketFilter,
}: {
  markets: MarketCatalogItem[];
  canCreatePost: boolean;
  onOpenMarket: (market: MarketCatalogItem) => void;
  marketFilter?: MarketCatalogItem;
}) {
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

  const load = useCallback(async () => {
    try {
      setPosts(await getConvictionFeed());
    } catch {
      setPosts([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const visiblePosts = useMemo(
    () =>
      marketFilter
        ? posts.filter((post) => post.instrument_public_id === marketFilter.instrument_public_id)
        : posts,
    [marketFilter, posts],
  );

  const selectedMarket = marketFilter ?? market;

  async function publish() {
    if (!body.trim()) return;
    setWorking(true);

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
      Alert.alert(
        'Post not published',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setWorking(false);
    }
  }

  async function openComments(post: ConvictionPost) {
    try {
      setComments(await getPostComments(post.post_public_id));
      setCommentsPostId(post.post_public_id);
      setCommentBody('');
    } catch (error) {
      Alert.alert(
        'Comments unavailable',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  }

  async function submitComment(post: ConvictionPost) {
    if (!commentBody.trim()) return;
    setWorking(true);

    try {
      await addPostComment(post.post_public_id, commentBody.trim());
      setCommentBody('');
      setComments(await getPostComments(post.post_public_id));
      await load();
    } catch (error) {
      Alert.alert(
        'Comment not posted',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setWorking(false);
    }
  }

  const commentsPost = posts.find((post) => post.post_public_id === commentsPostId) ?? null;

  return (
    <View style={{ gap: theme.spacing.md }}>
      {canCreatePost ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm }}>
          <VadText variant="caption" tone="secondary" style={{ flex: 1 }}>
            {marketFilter
              ? 'Share analysis or a prediction about this market.'
              : 'Publish analysis or attach a live market to make a prediction.'}
          </VadText>
          <VadButton
            label={composerOpen ? 'Close' : 'New post'}
            fullWidth={false}
            variant={composerOpen ? 'ghost' : 'secondary'}
            onPress={() => setComposerOpen((value) => !value)}
          />
        </View>
      ) : null}

      {composerOpen ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.md, borderRadius: theme.radius.xl }}>
          <View style={{ gap: theme.spacing.xxs }}>
            <VadText variant="heading">Share your conviction</VadText>
            <VadText variant="caption" tone="secondary">
              Explain what you believe and the reasoning behind it.
            </VadText>
          </View>

          <VadInput
            multiline
            value={body}
            onChangeText={setBody}
            placeholder="What do you believe, and why?"
          />

          {marketFilter ? (
            <View
              style={{
                borderRadius: theme.radius.lg,
                backgroundColor: theme.colors.surfaceMuted,
                padding: theme.spacing.sm,
                gap: 2,
              }}
            >
              <VadText variant="caption" tone="tertiary">ATTACHED MARKET</VadText>
              <VadText variant="bodyStrong" numberOfLines={2}>{marketFilter.title}</VadText>
            </View>
          ) : (
            <View style={{ gap: theme.spacing.xs }}>
              <VadText variant="label" tone="secondary">Live market · optional</VadText>
              {markets.slice(0, 4).map((item) => (
                <Pressable
                  key={item.instrument_public_id}
                  onPress={() => {
                    setMarket(
                      market?.instrument_public_id === item.instrument_public_id ? null : item,
                    );
                    setStance(null);
                  }}
                >
                  <VadCard
                    variant={
                      market?.instrument_public_id === item.instrument_public_id
                        ? 'muted'
                        : 'outlined'
                    }
                    style={{ padding: theme.spacing.sm, borderRadius: theme.radius.lg }}
                  >
                    <VadText
                      variant="caption"
                      tone={
                        market?.instrument_public_id === item.instrument_public_id
                          ? 'brand'
                          : 'primary'
                      }
                      numberOfLines={2}
                    >
                      {item.title}
                    </VadText>
                  </VadCard>
                </Pressable>
              ))}
            </View>
          )}

          {selectedMarket ? (
            <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
              <VadButton
                fullWidth={false}
                label={'YES ' + pct(selectedMarket.yes_price)}
                variant={stance === 'YES' ? 'primary' : 'secondary'}
                onPress={() => setStance('YES')}
              />
              <VadButton
                fullWidth={false}
                label={'NO ' + pct(selectedMarket.no_price)}
                variant={stance === 'NO' ? 'primary' : 'secondary'}
                onPress={() => setStance('NO')}
              />
            </View>
          ) : null}

          <VadButton
            label="Publish conviction"
            loading={working}
            disabled={!body.trim()}
            onPress={() => void publish()}
          />
        </VadCard>
      ) : null}

      {!visiblePosts.length ? (
        <VadEmptyState
          title={marketFilter ? 'No discussion yet' : 'No creator posts yet'}
          body={
            marketFilter
              ? 'Be the first to add reasoning or a prediction to this market.'
              : 'The first conviction can start a discussion without creating a duplicate financial market.'
          }
        />
      ) : (
        visiblePosts.map((post) => {
          const linked = post.instrument_public_id
            ? markets.find((item) => item.instrument_public_id === post.instrument_public_id)
            : undefined;
          const commentsOpen = commentsPostId === post.post_public_id;

          return (
            <ConvictionPostCard
              key={post.post_public_id}
              post={post}
              linkedMarket={linked}
              commentsOpen={commentsOpen}
              creatorOpen={false}
              onFollow={() => void toggleCreatorFollow(post.author_user_id).then(load)}
              onLike={() => void togglePostLike(post.post_public_id).then(load)}
              onComments={() => void openComments(post)}
              onOpenCreator={() => router.push('/creator/' + post.author_user_id)}
              onOpenMarket={() => linked && onOpenMarket(linked)}
            />
          );
        })
      )}

      <VadBottomSheet
        visible={Boolean(commentsPost)}
        title="Discussion"
        onClose={() => {
          setCommentsPostId(null);
          setComments([]);
          setCommentBody('');
        }}
      >
        <ScrollView
          style={{ maxHeight: 360 }}
          contentContainerStyle={{ gap: theme.spacing.sm }}
          keyboardShouldPersistTaps="handled"
        >
          {comments.length ? (
            comments.map((comment) => {
              const authorName =
                comment.author_display_name ?? comment.author_handle ?? 'VAD member';

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
                  <View style={{ flex: 1, gap: theme.spacing.xxs }}>
                    <VadText variant="label">{authorName}</VadText>
                    <VadText>{comment.body}</VadText>
                    <VadText variant="caption" tone="secondary">
                      {new Date(comment.created_at).toLocaleString()}
                    </VadText>
                  </View>
                </View>
              );
            })
          ) : (
            <VadText tone="secondary">No comments yet. Add to the discussion.</VadText>
          )}

          {commentsPost ? (
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
