import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type AdminGuidedCatalogField = {
  key: string;
  label: string;
  placeholder?: string;
  required: boolean;
};

export type AdminGuidedCatalogMarketType = {
  code: string;
  name: string;
  description: string;
  handler: 'VERIFIED_EVENT' | 'FOOTBALL_MATCH';
  questionTemplate: string;
  conditionTemplate: string;
  sourceLabel: string;
  sourceRequired: boolean;
  fields: AdminGuidedCatalogField[];
  displayOrder: number;
  metadata: Record<string, unknown>;
};

export type AdminGuidedCatalogCategory = {
  code: string;
  name: string;
  description: string;
  displayOrder: number;
  marketTypes: AdminGuidedCatalogMarketType[];
};

export type AdminGuidedMarketCatalog = {
  categories: AdminGuidedCatalogCategory[];
};

type CreateCatalogMarketInput = {
  title: string;
  description: string;
  marketTypeCode: string;
  details: Record<string, string>;
  condition?: string;
  sourceName: string;
  sourceUrl?: string;
  opensAt: string;
  closesAt: string;
  resolvesAfter: string;
  countryCode: string;
  assetCode: string;
  publishNow?: boolean;
};

function fail(error: { message: string; code?: string; details?: string; hint?: string } | null, fallback: string) {
  if (error) throw userFacingError(error, 'admin', fallback);
}

function asField(value: unknown): AdminGuidedCatalogField | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const key = String(raw.key ?? '').trim();
  const label = String(raw.label ?? '').trim();
  if (!key || !label) return null;
  return {
    key,
    label,
    placeholder: String(raw.placeholder ?? '').trim() || undefined,
    required: raw.required === true,
  };
}

function asMarketType(value: unknown): AdminGuidedCatalogMarketType | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const code = String(raw.code ?? '').trim();
  const name = String(raw.name ?? '').trim();
  if (!code || !name) return null;
  const handler = String(raw.handler ?? 'VERIFIED_EVENT').toUpperCase() === 'FOOTBALL_MATCH'
    ? 'FOOTBALL_MATCH'
    : 'VERIFIED_EVENT';
  return {
    code,
    name,
    description: String(raw.description ?? '').trim(),
    handler,
    questionTemplate: String(raw.questionTemplate ?? ''),
    conditionTemplate: String(raw.conditionTemplate ?? ''),
    sourceLabel: String(raw.sourceLabel ?? 'Authoritative result source'),
    sourceRequired: raw.sourceRequired !== false,
    fields: Array.isArray(raw.fields) ? raw.fields.map(asField).filter((item): item is AdminGuidedCatalogField => Boolean(item)) : [],
    displayOrder: Number.isFinite(Number(raw.displayOrder)) ? Number(raw.displayOrder) : 100,
    metadata: raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
      ? raw.metadata as Record<string, unknown>
      : {},
  };
}

export async function getAdminGuidedMarketCatalog(): Promise<AdminGuidedMarketCatalog> {
  const { data, error } = await supabase.rpc('admin_guided_market_catalog');
  fail(error, 'We could not load the guided market categories right now.');
  const raw = (data ?? {}) as Record<string, unknown>;
  const categories = Array.isArray(raw.categories)
    ? raw.categories.map((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const category = value as Record<string, unknown>;
      const code = String(category.code ?? '').trim();
      const name = String(category.name ?? '').trim();
      if (!code || !name) return null;
      return {
        code,
        name,
        description: String(category.description ?? '').trim(),
        displayOrder: Number.isFinite(Number(category.displayOrder)) ? Number(category.displayOrder) : 100,
        marketTypes: Array.isArray(category.marketTypes)
          ? category.marketTypes.map(asMarketType).filter((item): item is AdminGuidedCatalogMarketType => Boolean(item))
          : [],
      } satisfies AdminGuidedCatalogCategory;
    }).filter((item): item is AdminGuidedCatalogCategory => Boolean(item))
    : [];
  return { categories };
}

export async function createAdminCatalogMarket(input: CreateCatalogMarketInput) {
  const details = Object.fromEntries(
    Object.entries(input.details)
      .map(([key, value]) => [key, String(value ?? '').trim()])
      .filter(([, value]) => Boolean(value)),
  );
  const { data, error } = await supabase.rpc('admin_create_catalog_market', {
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_market_type_code: input.marketTypeCode,
    p_details: details,
    p_condition: input.condition?.trim() || null,
    p_source_name: input.sourceName.trim(),
    p_source_url: input.sourceUrl?.trim() || null,
    p_opens_at: input.opensAt,
    p_closes_at: input.closesAt,
    p_resolves_after: input.resolvesAfter,
    p_country_code: input.countryCode,
    p_asset_code: input.assetCode,
    p_publish_now: input.publishNow === true,
  });
  fail(error, 'We could not create this guided VAD market right now.');
  return (data ?? {}) as Record<string, unknown>;
}

export async function saveAdminGuidedCategory(input: {
  code: string;
  name: string;
  description?: string;
  displayOrder?: number;
  enabled?: boolean;
}) {
  const { data, error } = await supabase.rpc('admin_save_guided_category', {
    p_code: input.code,
    p_name: input.name,
    p_description: input.description ?? '',
    p_display_order: input.displayOrder ?? 100,
    p_enabled: input.enabled !== false,
  });
  fail(error, 'We could not save this market category right now.');
  return data === true;
}

export async function saveAdminSimpleGuidedMarketType(input: {
  code: string;
  categoryCode: string;
  name: string;
  description?: string;
  sourceLabel?: string;
  displayOrder?: number;
  enabled?: boolean;
}) {
  const { data, error } = await supabase.rpc('admin_save_simple_guided_market_type', {
    p_code: input.code,
    p_category_code: input.categoryCode,
    p_name: input.name,
    p_description: input.description ?? '',
    p_source_label: input.sourceLabel ?? 'Authoritative result source',
    p_display_order: input.displayOrder ?? 100,
    p_enabled: input.enabled !== false,
  });
  fail(error, 'We could not save this market type right now.');
  return data === true;
}
