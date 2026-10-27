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
  handler: 'VERIFIED_EVENT' | 'FOOTBALL_MATCH' | 'CRYPTO_THRESHOLD';
  questionTemplate: string;
  conditionTemplate: string;
  sourceLabel: string;
  sourceRequired: boolean;
  fields: AdminGuidedCatalogField[];
  displayOrder: number;
  metadata: Record<string, unknown>;
};

export type MarketPresentationProfile =
  | 'EVENT'
  | 'CRYPTO'
  | 'SPORTS'
  | 'MUSIC'
  | 'AI'
  | 'STOCKS'
  | 'ECONOMICS'
  | 'ENTERTAINMENT'
  | 'PUBLIC_EVENTS';

export type AdminGuidedCatalogCategory = {
  code: string;
  name: string;
  description: string;
  displayOrder: number;
  presentationProfile: MarketPresentationProfile;
  groupField: string;
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
  liquidityModel: 'POOL' | 'ORDER_BOOK';
  minTradeAmount: number;
  maxTradeAmount: number;
  publishNow?: boolean;
};

export type CreateMultiOutcomeMarketInput = {
  title: string;
  description: string;
  category: string;
  outcomes: string[];
  resolutionInstructions: string;
  sourceName: string;
  sourceUrl?: string;
  opensAt: string;
  closesAt: string;
  resolvesAfter: string;
  countryCode: string;
  assetCode: string;
  minTradeAmount: number;
  maxTradeAmount: number;
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
  const handlerCode = String(raw.handler ?? 'VERIFIED_EVENT').toUpperCase();
  const handler = handlerCode === 'FOOTBALL_MATCH'
    ? 'FOOTBALL_MATCH'
    : handlerCode === 'CRYPTO_THRESHOLD'
      ? 'CRYPTO_THRESHOLD'
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
        presentationProfile: normalizePresentationProfile(category.presentationProfile),
        groupField: String(category.groupField ?? '').trim(),
        marketTypes: Array.isArray(category.marketTypes)
          ? category.marketTypes.map(asMarketType).filter((item): item is AdminGuidedCatalogMarketType => Boolean(item))
          : [],
      } satisfies AdminGuidedCatalogCategory;
    }).filter((item): item is AdminGuidedCatalogCategory => Boolean(item))
    : [];
  return { categories };
}

function normalizePresentationProfile(value: unknown): MarketPresentationProfile {
  const allowed: MarketPresentationProfile[] = [
    'EVENT', 'CRYPTO', 'SPORTS', 'MUSIC', 'AI', 'STOCKS',
    'ECONOMICS', 'ENTERTAINMENT', 'PUBLIC_EVENTS',
  ];
  const profile = String(value ?? '').toUpperCase() as MarketPresentationProfile;
  return allowed.includes(profile) ? profile : 'EVENT';
}

export async function setAdminGuidedCategoryPresentation(input: {
  code: string;
  presentationProfile: MarketPresentationProfile;
  groupField: string;
}) {
  const { data, error } = await supabase.rpc('admin_set_guided_category_presentation', {
    p_category_code: input.code,
    p_presentation_profile: input.presentationProfile,
    p_group_field: input.groupField.trim(),
  });
  fail(error, 'We could not update this category display configuration right now.');
  return data === true;
}

export async function createAdminCatalogMarket(input: CreateCatalogMarketInput) {
  const details = Object.fromEntries(
    Object.entries(input.details)
      .map(([key, value]) => [key, String(value ?? '').trim()])
      .filter(([, value]) => Boolean(value)),
  );
  const { data, error } = await supabase.rpc('admin_create_catalog_market_v3', {
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
    p_liquidity_model: input.liquidityModel,
    p_min_trade_amount: input.minTradeAmount,
    p_max_trade_amount: input.maxTradeAmount,
    p_publish_now: input.publishNow === true,
  });
  fail(error, 'We could not create this guided VAD market right now.');
  return (data ?? {}) as Record<string, unknown>;
}

export async function createAdminMultiOutcomeMarket(input: CreateMultiOutcomeMarketInput) {
  const { data, error } = await supabase.rpc('admin_create_multi_outcome_market_v2', {
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_category: input.category.trim(),
    p_outcomes: input.outcomes.map((label) => label.trim()),
    p_resolution_instructions: input.resolutionInstructions.trim(),
    p_source_name: input.sourceName.trim(),
    p_source_url: input.sourceUrl?.trim() || null,
    p_opens_at: input.opensAt,
    p_closes_at: input.closesAt,
    p_resolves_after: input.resolvesAfter,
    p_country_code: input.countryCode,
    p_asset_code: input.assetCode,
    p_min_trade_amount: input.minTradeAmount,
    p_max_trade_amount: input.maxTradeAmount,
    p_publish_now: input.publishNow === true,
  });
  fail(error, 'We could not create this multiple-outcome market right now.');
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


export type SportsMarketCompetition = {
  sportCode: string;
  status: 'ACTIVE' | 'DISABLED';
  code: string;
  name: string;
  region: string;
  resultMode: 'AUTOMATIC' | 'VERIFIED';
  providerCode?: string | null;
  providerCompetitionCode?: string | null;
  aliases: string[];
};
export type SportsMarketTaxonomy = {
  sports: { code: string; name: string; status: 'ACTIVE' | 'DISABLED' }[];
  competitions: SportsMarketCompetition[];
};
export async function getSportsMarketTaxonomy(): Promise<SportsMarketTaxonomy> {
  const { data, error } = await supabase.rpc('get_sports_market_catalog');
  fail(error, 'Sports and competition choices could not be loaded.');
  const payload = (data ?? {}) as Partial<SportsMarketTaxonomy>;
  return {
    sports: Array.isArray(payload.sports) ? payload.sports : [],
    competitions: Array.isArray(payload.competitions) ? payload.competitions : [],
  };
}


export async function setAdminSportsCompetitionStatus(input: {
  sportCode: string;
  competitionCode: string;
  status: 'ACTIVE' | 'DISABLED';
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_set_sports_competition_status', {
    p_sport_code: input.sportCode.trim().toUpperCase(),
    p_competition_code: input.competitionCode.trim().toUpperCase(),
    p_status: input.status,
    p_reason: input.reason.trim(),
  });
  fail(error, 'The sports competition setting could not be updated.');
  return data === true;
}


export async function upsertAdminSportsCompetition(input: {
  sportCode: string;
  sportName: string;
  competitionCode: string;
  competitionName: string;
  region?: string;
  aliases?: string[];
  resultMode: 'AUTOMATIC' | 'VERIFIED';
  providerCode?: string;
  providerCompetitionCode?: string;
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_upsert_sports_competition', {
    p_sport_code: input.sportCode.trim().toUpperCase(),
    p_sport_name: input.sportName.trim(),
    p_competition_code: input.competitionCode.trim().toUpperCase(),
    p_competition_name: input.competitionName.trim(),
    p_region: input.region?.trim() || '',
    p_aliases: input.aliases ?? [],
    p_result_mode: input.resultMode,
    p_provider_code: input.providerCode?.trim().toUpperCase() || null,
    p_provider_competition_code: input.providerCompetitionCode?.trim().toUpperCase() || null,
    p_reason: input.reason.trim(),
  });
  fail(error, 'The sports competition could not be saved.');
  return data === true;
}
