import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { VadButton } from '@/components/ui/vad-button';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { PostComment } from '@/services/social-api';

type CommentNode = PostComment & { replies: CommentNode[] };

type Props = {
  comments: PostComment[];
  activeReplyId: string | null;
  replyBody: string;
  replyWorking: boolean;
  onReplyStart: (comment: PostComment) => void;
  onReplyBodyChange: (value: string) => void;
  onReplyCancel: () => void;
  onReplySubmit: (comment: PostComment) => void;
};

function buildCommentTree(comments: PostComment[]) {
  const nodes = new Map<string, CommentNode>();
  comments.forEach((comment) => {
    nodes.set(comment.comment_public_id, { ...comment, replies: [] });
  });

  const roots: CommentNode[] = [];
  comments.forEach((comment) => {
    const node = nodes.get(comment.comment_public_id);
    if (!node) return;
    const parentId = comment.parent_comment_public_id;
    const parent = parentId ? nodes.get(parentId) : null;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  });

  return roots;
}

export function CommentThreadList(props: Props) {
  const roots = useMemo(() => buildCommentTree(props.comments), [props.comments]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  function toggleCollapsed(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <View style={{ gap: 6 }}>
      {roots.map((comment) => (
        <ThreadNode
          key={comment.comment_public_id}
          comment={comment}
          depth={0}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          {...props}
        />
      ))}
    </View>
  );
}

function ThreadNode({
  comment,
  depth,
  collapsed,
  onToggleCollapsed,
  activeReplyId,
  replyBody,
  replyWorking,
  onReplyStart,
  onReplyBodyChange,
  onReplyCancel,
  onReplySubmit,
}: Props & {
  comment: CommentNode;
  depth: number;
  collapsed: Set<string>;
  onToggleCollapsed: (id: string) => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const authorName = comment.author_display_name ?? comment.author_handle ?? 'VAD member';
  const replyOpen = activeReplyId === comment.comment_public_id;
  const repliesCollapsed = collapsed.has(comment.comment_public_id);
  const visualDepth = Math.min(depth, 3);
  const replyCount = comment.replies.length;
  const handle = comment.author_handle ? `@${comment.author_handle}` : authorName;

  return (
    <View
      style={{
        marginLeft: visualDepth ? (density.compact ? 10 : 14) : 0,
        paddingLeft: visualDepth ? (density.compact ? 8 : 12) : 0,
        borderLeftWidth: visualDepth ? 1 : 0,
        borderLeftColor: theme.colors.borderStrong,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          gap: density.compact ? 8 : theme.spacing.sm,
          paddingVertical: density.compact ? 8 : theme.spacing.sm,
          borderBottomWidth: depth === 0 ? 1 : 0,
          borderBottomColor: theme.colors.border,
        }}
      >
        <ProfileAvatar
          path={comment.author_avatar_path}
          name={authorName}
          size={depth === 0 ? (density.compact ? 30 : 34) : density.compact ? 26 : 30}
        />

        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <VadText variant="label" numberOfLines={1}>{authorName}</VadText>
            {comment.author_handle ? (
              <VadText variant="caption" tone="tertiary" numberOfLines={1}>@{comment.author_handle}</VadText>
            ) : null}
            <VadText variant="caption" tone="tertiary">
              {new Date(comment.created_at).toLocaleString()}
            </VadText>
          </View>

          <VadText variant="body">{comment.body}</VadText>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, flexWrap: 'wrap' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Reply to ${authorName}`}
              onPress={() => onReplyStart(comment)}
              hitSlop={7}
              style={({ pressed }) => ({ minHeight: 30, justifyContent: 'center', opacity: pressed ? 0.58 : 1 })}
            >
              <VadText variant="caption" tone={replyOpen ? 'brand' : 'secondary'}>Reply</VadText>
            </Pressable>

            {replyCount ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: !repliesCollapsed }}
                onPress={() => onToggleCollapsed(comment.comment_public_id)}
                hitSlop={7}
                style={({ pressed }) => ({ minHeight: 30, justifyContent: 'center', opacity: pressed ? 0.58 : 1 })}
              >
                <VadText variant="caption" tone="brand">
                  {repliesCollapsed ? `View ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}` : `Hide ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
                </VadText>
              </Pressable>
            ) : null}
          </View>

          {replyOpen ? (
            <View
              style={{
                gap: theme.spacing.xs,
                padding: density.compact ? 8 : theme.spacing.sm,
                borderRadius: theme.radius.lg,
                backgroundColor: theme.colors.surfaceRaised,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <VadText variant="caption" tone="secondary">Replying to {handle}</VadText>
              <VadInput
                value={replyBody}
                onChangeText={onReplyBodyChange}
                placeholder={`Reply to ${handle}…`}
                multiline
                maxLength={2000}
                autoFocus
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.xs }}>
                <VadButton label="Cancel" variant="ghost" size="small" fullWidth={false} disabled={replyWorking} onPress={onReplyCancel} />
                <VadButton label="Reply" size="small" fullWidth={false} loading={replyWorking} disabled={!replyBody.trim()} onPress={() => onReplySubmit(comment)} />
              </View>
            </View>
          ) : null}
        </View>
      </View>

      {!repliesCollapsed && comment.replies.length ? (
        <View>
          {comment.replies.map((reply) => (
            <ThreadNode
              key={reply.comment_public_id}
              comment={reply}
              depth={depth + 1}
              collapsed={collapsed}
              onToggleCollapsed={onToggleCollapsed}
              activeReplyId={activeReplyId}
              replyBody={replyBody}
              replyWorking={replyWorking}
              onReplyStart={onReplyStart}
              onReplyBodyChange={onReplyBodyChange}
              onReplyCancel={onReplyCancel}
              onReplySubmit={onReplySubmit}
              comments={[]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
