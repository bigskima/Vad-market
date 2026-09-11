import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { AdminSectionTabs } from '@/features/admin/components/admin-section-tabs';
import { pickProfileImage } from '@/lib/profile-image-picker';
import { useVadTheme } from '@/providers/theme-provider';
import {
  deleteAdminPublicNotice,
  listAdminHomePromotions,
  listAdminPublicNotices,
  uploadHomePromotionImage,
  upsertAdminHomePromotion,
  upsertAdminPublicNotice,
  type HomePromotion,
  type PublicNotice,
} from '@/services/home-content-api';

type Tab = 'promotions' | 'notice';
type BannerKind = 'TEXT' | 'IMAGE';
type NoticeTone = 'WARNING' | 'SUCCESS';

const bannerKinds = [
  { value: 'TEXT', label: 'Text banner' },
  { value: 'IMAGE', label: 'Image banner' },
] as const;

const noticeTones = [
  { value: 'WARNING', label: 'Yellow alert' },
  { value: 'SUCCESS', label: 'Green info' },
] as const;

export function AdminHomeContentScreen() {
  const theme = useVadTheme();
  const [tab, setTab] = useState<Tab>('promotions');
  const [promotions, setPromotions] = useState<HomePromotion[]>([]);
  const [notices, setNotices] = useState<PublicNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [promotionEditor, setPromotionEditor] = useState<HomePromotion | 'NEW' | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    setError(null);
    try {
      const [nextPromotions, nextNotices] = await Promise.all([
        listAdminHomePromotions(),
        listAdminPublicNotices(),
      ]);
      setPromotions(nextPromotions);
      setNotices(nextNotices);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Home content could not be loaded.');
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="48%" height={30} />
        <VadSkeleton height={42} />
        <VadSkeleton height={100} radius={theme.radius.lg} />
        <VadSkeleton height={100} radius={theme.radius.lg} />
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.md, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 240, gap: 3 }}>
          <VadText variant="label" tone="brand">HOME CONTENT</VadText>
          <VadText variant="title">Promotions & public notices.</VadText>
          <VadText variant="caption" tone="secondary">
            Publish text or image banners and one short public-awareness notice. A new published notice automatically replaces the current one.
          </VadText>
        </View>
        <VadButton
          label="Refresh"
          variant="secondary"
          size="small"
          fullWidth={false}
          loading={refreshing}
          onPress={() => void load(true)}
        />
      </View>

      {error ? <VadErrorState title="Home content refresh failed" message={error} onRetry={() => void load(true)} /> : null}

      {message ? (
        <View style={{ borderLeftWidth: 3, borderLeftColor: theme.colors.yes, backgroundColor: theme.colors.yesSoft, padding: theme.spacing.md, borderRadius: theme.radius.md, gap: 2 }}>
          <VadText variant="bodyStrong" tone="yes">Home content updated</VadText>
          <VadText variant="caption" tone="secondary">{message}</VadText>
        </View>
      ) : null}

      <AdminSectionTabs
        active={tab}
        onChange={(value) => setTab(value as Tab)}
        items={[
          { key: 'promotions', label: 'Promotions', count: promotions.filter((item) => item.status === 'PUBLISHED').length },
          { key: 'notice', label: 'Public notice', count: notices.filter((item) => item.status === 'PUBLISHED').length },
        ]}
      />

      {tab === 'promotions' ? (
        <PromotionSection promotions={promotions} onEdit={setPromotionEditor} />
      ) : (
        <NoticeEditor
          notices={notices}
          onSaved={async (nextMessage) => {
            setMessage(nextMessage);
            await load(true);
          }}
        />
      )}

      <VadBottomSheet
        visible={Boolean(promotionEditor)}
        title={promotionEditor === 'NEW' ? 'New promotion' : 'Edit promotion'}
        onClose={() => setPromotionEditor(null)}
      >
        {promotionEditor ? (
          <PromotionEditor
            promotion={promotionEditor === 'NEW' ? null : promotionEditor}
            onSaved={async (nextMessage) => {
              setPromotionEditor(null);
              setMessage(nextMessage);
              await load(true);
            }}
          />
        ) : null}
      </VadBottomSheet>
    </View>
  );
}

function PromotionSection({
  promotions,
  onEdit,
}: {
  promotions: HomePromotion[];
  onEdit: (promotion: HomePromotion | 'NEW') => void;
}) {
  const theme = useVadTheme();

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="heading">Promotion carousel</VadText>
          <VadText variant="caption" tone="secondary">Published banners swipe horizontally and auto-rotate on Home.</VadText>
        </View>
        <VadButton label="Add promotion" size="small" fullWidth={false} onPress={() => onEdit('NEW')} />
      </View>

      {promotions.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          {promotions.map((promotion) => (
            <Pressable
              key={promotion.public_id}
              accessibilityRole="button"
              onPress={() => onEdit(promotion)}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  {promotion.banner_kind === 'IMAGE' && promotion.image_url ? (
                    <Image
                      source={{ uri: promotion.image_url }}
                      resizeMode="cover"
                      style={{ width: 72, height: 46, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceMuted }}
                    />
                  ) : null}
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <VadText variant="bodyStrong" numberOfLines={1}>{promotion.title || 'Image promotion'}</VadText>
                    <VadText variant="caption" tone="secondary" numberOfLines={1}>{promotion.banner_kind} · {promotion.target_path}</VadText>
                  </View>
                  <VadChip
                    label={promotion.status}
                    tone={promotion.status === 'PUBLISHED' ? 'yes' : promotion.status === 'DRAFT' ? 'warning' : 'neutral'}
                  />
                </View>
              </VadCard>
            </Pressable>
          ))}
        </View>
      ) : (
        <VadEmptyState
          title="No promotions configured"
          body="Home remains clean until an admin publishes a text or image banner."
          actionLabel="Create promotion"
          onAction={() => onEdit('NEW')}
        />
      )}
    </View>
  );
}

function PromotionEditor({
  promotion,
  onSaved,
}: {
  promotion: HomePromotion | null;
  onSaved: (message: string) => Promise<void>;
}) {
  const theme = useVadTheme();
  const [kind, setKind] = useState<BannerKind>(promotion?.banner_kind ?? 'TEXT');
  const [title, setTitle] = useState(promotion?.title ?? '');
  const [body, setBody] = useState(promotion?.body ?? '');
  const [imageUrl, setImageUrl] = useState(promotion?.image_url ?? '');
  const [targetPath, setTargetPath] = useState(promotion?.target_path ?? '/markets');
  const [sortOrder, setSortOrder] = useState(String(promotion?.sort_order ?? 100));
  const [working, setWorking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function chooseImage() {
    setUploading(true);
    setError(null);
    try {
      const image = await pickProfileImage();
      if (!image) return;
      setImageUrl(await uploadHomePromotionImage(image.bytes, image.mimeType));
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Banner image could not be uploaded.');
    } finally {
      setUploading(false);
    }
  }

  async function save(status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
    const order = Number(sortOrder);
    if (!Number.isInteger(order) || order < 0 || order > 10000) {
      setError('Sort order must be a whole number from 0 to 10000.');
      return;
    }
    if (kind === 'TEXT' && !title.trim()) {
      setError('Text banners require a title.');
      return;
    }
    if (kind === 'IMAGE' && !imageUrl.trim()) {
      setError('Choose an image before saving an image banner.');
      return;
    }

    setWorking(true);
    setError(null);
    try {
      await upsertAdminHomePromotion({
        publicId: promotion?.public_id,
        bannerKind: kind,
        title: title || null,
        body: body || null,
        imageUrl: kind === 'IMAGE' ? imageUrl : null,
        targetPath,
        status,
        sortOrder: order,
      });
      await onSaved(
        status === 'PUBLISHED'
          ? 'Promotion is now live on Home.'
          : status === 'ARCHIVED'
            ? 'Promotion archived and removed from Home.'
            : 'Promotion saved as a draft.',
      );
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Promotion could not be saved.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
      <VadSegmentedControl value={kind} options={bannerKinds} onChange={setKind} />

      {kind === 'IMAGE' ? (
        <View style={{ gap: theme.spacing.sm }}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} resizeMode="cover" style={{ width: '100%', height: 118, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceMuted }} />
          ) : (
            <VadCard variant="muted" style={{ minHeight: 82, justifyContent: 'center' }}>
              <VadText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>No banner image selected</VadText>
            </VadCard>
          )}
          <VadButton label={imageUrl ? 'Replace image' : 'Choose image'} variant="secondary" size="small" loading={uploading} onPress={() => void chooseImage()} />
          <VadInput label="Admin label (optional)" value={title} onChangeText={setTitle} placeholder="Internal label for this image banner" />
        </View>
      ) : (
        <>
          <VadInput label="Banner title" value={title} onChangeText={setTitle} placeholder="Short promotional headline" />
          <VadInput label="Supporting text (optional)" value={body} onChangeText={setBody} placeholder="One short supporting line" />
        </>
      )}

      <VadInput
        label="Destination route"
        value={targetPath}
        onChangeText={setTargetPath}
        placeholder="/markets or /market/..."
        autoCapitalize="none"
        autoCorrect={false}
        hint="Any valid internal VAD route can be used."
      />
      <VadInput
        label="Sort order"
        value={sortOrder}
        onChangeText={(value) => setSortOrder(value.replace(/\D/g, ''))}
        keyboardType="number-pad"
        hint="Lower numbers appear earlier in the carousel."
      />

      {error ? <VadErrorState title="Promotion not saved" message={error} /> : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <VadButton label="Save draft" variant="secondary" loading={working} disabled={uploading} onPress={() => void save('DRAFT')} style={{ flex: 1 }} />
        <VadButton label="Publish" loading={working} disabled={uploading} onPress={() => void save('PUBLISHED')} style={{ flex: 1 }} />
      </View>
      {promotion ? (
        <VadButton label="Archive promotion" variant="ghost" disabled={working || uploading} onPress={() => void save('ARCHIVED')} />
      ) : null}
    </ScrollView>
  );
}

function NoticeEditor({
  notices,
  onSaved,
}: {
  notices: PublicNotice[];
  onSaved: (message: string) => Promise<void>;
}) {
  const theme = useVadTheme();
  const initial = notices.find((notice) => notice.status === 'PUBLISHED') ?? notices[0] ?? null;
  const [publicId, setPublicId] = useState<string | null>(initial?.public_id ?? null);
  const [message, setMessage] = useState(initial?.message ?? '');
  const [tone, setTone] = useState<NoticeTone>(initial?.tone ?? 'WARNING');
  const [status, setStatus] = useState<PublicNotice['status'] | 'NEW'>(initial?.status ?? 'NEW');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');

  const activeNotice = useMemo(
    () => notices.find((notice) => notice.status === 'PUBLISHED') ?? null,
    [notices],
  );

  useEffect(() => {
    if (!publicId) return;
    const latest = notices.find((notice) => notice.public_id === publicId);
    if (!latest) {
      const fallback = notices.find((notice) => notice.status === 'PUBLISHED') ?? notices[0] ?? null;
      setPublicId(fallback?.public_id ?? null);
      setMessage(fallback?.message ?? '');
      setTone(fallback?.tone ?? 'WARNING');
      setStatus(fallback?.status ?? 'NEW');
      return;
    }
    setStatus(latest.status);
  }, [notices, publicId]);

  function editNotice(notice: PublicNotice) {
    setPublicId(notice.public_id);
    setMessage(notice.message);
    setTone(notice.tone);
    setStatus(notice.status);
    setError(null);
  }

  function startNew() {
    setPublicId(null);
    setMessage('');
    setTone('WARNING');
    setStatus('NEW');
    setError(null);
  }

  async function save(nextStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
    if (message.trim().length < 3 || message.trim().length > 220) {
      setError('Public notice must be between 3 and 220 characters.');
      return;
    }

    setWorking(true);
    setError(null);
    try {
      const id = await upsertAdminPublicNotice({ publicId, message, tone, status: nextStatus });
      setPublicId(id);
      setStatus(nextStatus);
      await onSaved(
        nextStatus === 'PUBLISHED'
          ? 'Public notice is live. Any previous live notice was automatically replaced.'
          : nextStatus === 'ARCHIVED'
            ? 'Public notice disabled and removed from Home. No notice will show until another one is published.'
            : 'Public notice saved as a draft and is not visible on Home.',
      );
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Public notice could not be saved.');
    } finally {
      setWorking(false);
    }
  }

  async function removeNotice() {
    if (!publicId || deleteReason.trim().length < 3) return;
    setWorking(true);
    setError(null);
    try {
      await deleteAdminPublicNotice(publicId, deleteReason);
      setDeleteOpen(false);
      setDeleteReason('');
      setPublicId(null);
      setMessage('');
      setTone('WARNING');
      setStatus('NEW');
      await onSaved('Public notice permanently deleted. It was removed from Home immediately if it was live.');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Public notice could not be deleted.');
    } finally {
      setWorking(false);
    }
  }

  const validMessage = message.trim().length >= 3 && message.trim().length <= 220;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="heading">Public awareness strip</VadText>
          <VadText variant="caption" tone="secondary">
            Only one notice can be live. Publish a new one to replace the current notice, disable it to hide it while keeping history, or delete it permanently.
          </VadText>
        </View>
        <VadButton label="New notice" variant="secondary" size="small" fullWidth={false} onPress={startNew} />
      </View>

      <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <VadText variant="caption" tone="secondary">CURRENT PUBLIC STATE</VadText>
          <VadChip label={activeNotice ? 'LIVE' : 'NO PUBLIC NOTICE'} tone={activeNotice ? 'yes' : 'neutral'} />
        </View>
        <VadText variant="bodyStrong" numberOfLines={2}>
          {activeNotice?.message ?? 'Home currently has no public awareness notice.'}
        </VadText>
      </VadCard>

      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <VadText variant="bodyStrong">{publicId ? 'Edit notice' : 'Create notice'}</VadText>
          <VadChip
            label={status === 'ARCHIVED' ? 'DISABLED' : status}
            tone={status === 'PUBLISHED' ? 'yes' : status === 'DRAFT' ? 'warning' : 'neutral'}
          />
        </View>

        <VadCard
          variant="raised"
          style={{
            borderColor: tone === 'WARNING' ? theme.colors.warning : theme.colors.yes,
            backgroundColor: tone === 'WARNING' ? theme.colors.warningSoft : theme.colors.yesSoft,
            paddingVertical: 8,
          }}
        >
          <VadText
            variant="caption"
            tone={tone === 'WARNING' ? 'warning' : 'yes'}
            numberOfLines={1}
            style={{ textAlign: 'center', fontWeight: '700' }}
          >
            {message || 'Your short public notice preview appears here.'}
          </VadText>
        </VadCard>

        <VadInput
          label="Public notice"
          value={message}
          onChangeText={setMessage}
          placeholder="Important platform update for everyone"
          hint={`${message.trim().length}/220 characters`}
        />
        <VadSegmentedControl value={tone} options={noticeTones} onChange={setTone} />

        {error ? <VadErrorState title="Notice action failed" message={error} /> : null}

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <VadButton
            label="Save draft"
            variant="secondary"
            loading={working}
            disabled={!validMessage}
            onPress={() => void save('DRAFT')}
            style={{ flex: 1 }}
          />
          <VadButton
            label={status === 'PUBLISHED' ? 'Update live notice' : 'Publish'}
            loading={working}
            disabled={!validMessage}
            onPress={() => void save('PUBLISHED')}
            style={{ flex: 1 }}
          />
        </View>

        {publicId ? (
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <VadButton
              label="Disable notice"
              variant="ghost"
              disabled={working || status === 'ARCHIVED'}
              onPress={() => void save('ARCHIVED')}
              style={{ flex: 1 }}
            />
            <VadButton
              label="Delete notice"
              variant="danger"
              disabled={working}
              onPress={() => {
                setDeleteReason('');
                setDeleteOpen(true);
              }}
              style={{ flex: 1 }}
            />
          </View>
        ) : null}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <VadText variant="heading">Notice history</VadText>
        <VadText variant="caption" tone="secondary">Select any retained notice to edit, republish, disable or delete it.</VadText>
        {notices.length ? notices.map((notice) => (
          <Pressable
            key={notice.public_id}
            accessibilityRole="button"
            accessibilityState={{ selected: notice.public_id === publicId }}
            onPress={() => editNotice(notice)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <VadCard
              variant="raised"
              style={{
                gap: theme.spacing.xs,
                borderColor: notice.public_id === publicId ? theme.colors.brandPrimary : theme.colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <VadText variant="bodyStrong" numberOfLines={1}>{notice.message}</VadText>
                  <VadText variant="caption" tone="secondary">Updated {new Date(notice.updated_at).toLocaleString()}</VadText>
                </View>
                <VadChip
                  label={notice.status === 'ARCHIVED' ? 'DISABLED' : notice.status}
                  tone={notice.status === 'PUBLISHED' ? 'yes' : notice.status === 'DRAFT' ? 'warning' : 'neutral'}
                />
              </View>
            </VadCard>
          </Pressable>
        )) : (
          <VadEmptyState title="No public notices" body="Create a notice when there is something everyone on VAD needs to see." />
        )}
      </View>

      <VadBottomSheet
        visible={deleteOpen}
        title="Delete public notice"
        onClose={() => {
          if (!working) setDeleteOpen(false);
        }}
      >
        <View style={{ gap: theme.spacing.md }}>
          <VadText variant="bodyStrong">This permanently removes the selected notice.</VadText>
          <VadText variant="caption" tone="secondary">
            If this notice is currently live, it disappears from Home immediately. This cannot be undone, but the deletion remains in the audit trail.
          </VadText>
          <VadInput
            label="Deletion reason"
            value={deleteReason}
            onChangeText={setDeleteReason}
            placeholder="Why is this notice being deleted?"
            multiline
          />
          <VadButton
            label="Delete permanently"
            variant="danger"
            loading={working}
            disabled={deleteReason.trim().length < 3}
            onPress={() => void removeNotice()}
          />
        </View>
      </VadBottomSheet>
    </View>
  );
}
