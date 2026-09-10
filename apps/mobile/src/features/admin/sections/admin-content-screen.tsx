import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getAdminContent,
  setAdminContentStatus,
  type AdminContentRow,
} from '@/services/admin-control-api';

type Filter = 'all' | 'published' | 'removed';

export function AdminContentScreen() {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const [rows, setRows] = useState<AdminContentRow[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminContentRow | null>(null);
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    setError(null);
    try {
      setRows(
        await getAdminContent(
          100,
          filter === 'all'
            ? undefined
            : filter === 'published'
              ? 'PUBLISHED'
              : 'REMOVED',
        ),
      );
    } catch (reasonValue) {
      setError(
        reasonValue instanceof Error
          ? reasonValue.message
          : 'Content moderation queue could not be loaded.',
      );
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const counts = useMemo(() => {
    const next = { posts: 0, comments: 0, removed: 0 };
    rows.forEach((row) => {
      if (row.content_type === 'POST') next.posts += 1;
      else next.comments += 1;
      if (row.status === 'REMOVED') next.removed += 1;
    });
    return next;
  }, [rows]);

  async function apply() {
    if (!selected || reason.trim().length < 3) return;
    const nextStatus = selected.status === 'PUBLISHED' ? 'REMOVED' : 'PUBLISHED';

    setWorking(true);
    setActionError(null);
    try {
      await setAdminContentStatus({
        contentType: selected.content_type,
        contentPublicId: selected.content_public_id,
        status: nextStatus,
        reason,
      });
      setSelected(null);
      setReason('');
      await load(true);
    } catch (reasonValue) {
      setActionError(
        reasonValue instanceof Error
          ? reasonValue.message
          : 'Moderation action could not be completed.',
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <View style={{ gap: theme.spacing.xxxl }}>
      <View
        style={{
          flexDirection: wide ? 'row' : 'column',
          gap: theme.spacing.xl,
          alignItems: wide ? 'flex-end' : 'stretch',
        }}
      >
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="label" tone="brand">CONTENT MODERATION</VadText>
          <VadText variant="title">Remove harmful content without erasing evidence.</VadText>
          <VadText tone="secondary">
            Moderators can remove or restore published posts and comments. VAD
            keeps the record and audit trail instead of physically deleting it.
          </VadText>
        </View>

        <VadButton
          label="Refresh"
          variant="secondary"
          size="small"
          fullWidth={!wide}
          loading={refreshing}
          onPress={() => void load(true)}
        />
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
        }}
      >
        <Summary label="Posts" value={counts.posts} />
        <Summary label="Comments" value={counts.comments} />
        <Summary label="Removed" value={counts.removed} tone="danger" />
      </View>

      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        {(
          [
            ['all', 'All'],
            ['published', 'Published'],
            ['removed', 'Removed'],
          ] as const
        ).map(([value, label]) => {
          const selectedFilter = filter === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: selectedFilter }}
              onPress={() => {
                setLoading(true);
                setFilter(value);
              }}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 46,
                alignItems: 'center',
                justifyContent: 'center',
                borderBottomWidth: 2,
                borderBottomColor: selectedFilter
                  ? theme.colors.brandPrimary
                  : 'transparent',
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <VadText
                variant="caption"
                tone={selectedFilter ? 'brand' : 'secondary'}
              >
                {label}
              </VadText>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadSkeleton height={94} />
          <VadSkeleton height={94} />
          <VadSkeleton height={94} />
        </View>
      ) : error && !rows.length ? (
        <VadErrorState
          title="Moderation queue unavailable"
          message={error}
          onRetry={() => {
            setLoading(true);
            void load();
          }}
        />
      ) : rows.length ? (
        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          {rows.map((row) => (
            <Pressable
              key={`${row.content_type}-${row.content_public_id}`}
              accessibilityRole="button"
              accessibilityLabel={`${row.status === 'PUBLISHED' ? 'Moderate' : 'Review removed'} ${row.content_type.toLowerCase()}`}
              onPress={() => {
                setSelected(row);
                setReason('');
                setActionError(null);
              }}
              style={({ pressed }) => ({
                minHeight: 94,
                paddingVertical: theme.spacing.md,
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: theme.spacing.md,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <View style={{ flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
                  <VadText variant="caption" tone="brand">{row.content_type}</VadText>
                  <VadText variant="caption" tone="tertiary">·</VadText>
                  <VadText variant="caption" tone="secondary">
                    {row.author_name}{row.author_handle ? ` · @${row.author_handle}` : ''}
                  </VadText>
                </View>
                <VadText numberOfLines={3}>{row.body}</VadText>
                <VadText variant="caption" tone="tertiary">
                  {new Date(row.created_at).toLocaleString()}
                </VadText>
              </View>

              <View
                style={{
                  borderRadius: theme.radius.pill,
                  backgroundColor:
                    row.status === 'REMOVED'
                      ? theme.colors.noSoft
                      : theme.colors.yesSoft,
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: theme.spacing.xs,
                }}
              >
                <VadText
                  variant="caption"
                  tone={row.status === 'REMOVED' ? 'danger' : 'yes'}
                >
                  {row.status}
                </VadText>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <VadEmptyState
          title="Nothing in this moderation view"
          body="Published and removed posts or comments will appear here according to the selected filter."
        />
      )}

      {error && rows.length ? (
        <VadErrorState
          title="Moderation refresh failed"
          message={error}
          onRetry={() => void load(true)}
        />
      ) : null}

      <VadBottomSheet
        visible={Boolean(selected)}
        title={selected?.status === 'PUBLISHED' ? 'Remove content?' : 'Restore content?'}
        onClose={() => {
          if (!working) setSelected(null);
        }}
      >
        {selected ? (
          <View style={{ gap: theme.spacing.lg }}>
            <View style={{ gap: theme.spacing.xs }}>
              <VadText variant="caption" tone="brand">{selected.content_type}</VadText>
              <VadText variant="bodyStrong">{selected.author_name}</VadText>
              <VadText tone="secondary">{selected.body}</VadText>
            </View>

            <VadInput
              label="Moderation reason"
              value={reason}
              onChangeText={(value) => {
                setReason(value);
                setActionError(null);
              }}
              placeholder="Why should this content be removed or restored?"
              multiline
              error={reason.length > 0 && reason.trim().length < 3 ? 'Enter at least 3 characters.' : undefined}
            />

            <View
              style={{
                borderLeftWidth: 3,
                borderLeftColor:
                  selected.status === 'PUBLISHED'
                    ? theme.colors.warning
                    : theme.colors.brandPrimary,
                backgroundColor:
                  selected.status === 'PUBLISHED'
                    ? theme.colors.warningSoft
                    : theme.colors.brandSoft,
                padding: theme.spacing.md,
                gap: 2,
              }}
            >
              <VadText
                variant="caption"
                tone={selected.status === 'PUBLISHED' ? 'warning' : 'brand'}
              >
                {selected.status === 'PUBLISHED' ? 'SOFT REMOVE' : 'RESTORE'}
              </VadText>
              <VadText variant="caption" tone="secondary">
                {selected.status === 'PUBLISHED'
                  ? 'The content disappears from normal product surfaces, but its record and audit evidence are retained.'
                  : 'The content becomes visible again and the restoration is recorded in the audit trail.'}
              </VadText>
            </View>

            {actionError ? (
              <VadErrorState title="Moderation action failed" message={actionError} />
            ) : null}

            <VadButton
              label={selected.status === 'PUBLISHED' ? 'Remove content' : 'Restore content'}
              variant={selected.status === 'PUBLISHED' ? 'danger' : 'primary'}
              loading={working}
              disabled={reason.trim().length < 3}
              onPress={() => void apply()}
            />
          </View>
        ) : null}
      </VadBottomSheet>
    </View>
  );
}

function Summary({
  label,
  value,
  tone = 'primary',
}: {
  label: string;
  value: number;
  tone?: 'primary' | 'danger';
}) {
  const theme = useVadTheme();
  return (
    <View
      style={{
        minWidth: 120,
        flexGrow: 1,
        flexBasis: 130,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
        paddingVertical: theme.spacing.sm,
        gap: 2,
      }}
    >
      <VadText variant="heading" tone={value ? tone : 'primary'}>{value}</VadText>
      <VadText variant="caption" tone="secondary">{label}</VadText>
    </View>
  );
}
