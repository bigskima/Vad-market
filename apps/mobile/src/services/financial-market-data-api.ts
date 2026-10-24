import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type FinancialAssetClass = 'STOCKS' | 'COMMODITIES' | 'FOREX' | 'ECONOMICS';

export type FinancialMarketQuote = {
  id: string;
  symbol: string;
  name: string;
  assetClass: FinancialAssetClass;
  quoteCurrency: string;
  /** Provider or symbol-directory image; display only. */
  imageUrl?: string | null;
  /** Second currency flag for a paired FX visual. */
  secondaryImageUrl?: string | null;
  visualKind?: 'logo' | 'flag-pair' | 'series-chart' | 'symbol';
  currentPrice: number | null;
  change24hPercent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  marketOpen: boolean | null;
  sourceUpdatedAt: string | null;
  exchange: string | null;
  source: string;
  sourceCode: string;
};

export type FinancialMarketDataPage = {
  ok: boolean;
  source?: string;
  sourceCode?: string;
  dataPurpose?: 'DISPLAY_ONLY';
  assetClass: FinancialAssetClass;
  quoteCurrency?: string;
  query: string;
  fetchedAt?: string;
  cacheSeconds?: number;
  cached?: boolean;
  stale?: boolean;
  items: FinancialMarketQuote[];
  message?: string;
};

export type AdminFinancialMarketDataSource = {
  code: string;
  name: string;
  base_url: string;
  status: 'ACTIVE' | 'DISABLED' | string;
  quote_currency: string;
  default_page_size: number;
  cache_seconds: number;
  asset_class: FinancialAssetClass | 'CRYPTO' | string;
  adapter_code: string;
  priority: number;
  daily_request_limit: number;
  secret_reference: string | null;
  provider_metadata: Record<string, unknown>;
  updated_at: string;
};

function fail(error: { message: string; code?: string; details?: string; hint?: string } | null, fallback: string) {
  if (error) throw userFacingError(error, 'markets', fallback);
}

export async function getFinancialMarketData(input: {
  assetClass: FinancialAssetClass;
  query: string;
}): Promise<FinancialMarketDataPage> {
  const { data, error } = await supabase.functions.invoke('financial-market-data', {
    body: { assetClass: input.assetClass, query: input.query.trim() },
  });
  if (error) throw userFacingError(error, 'markets', 'Financial market data is temporarily unavailable.');
  const payload = data as Partial<FinancialMarketDataPage> & { error?: string; code?: string; message?: string };
  if (payload?.error) throw new Error(payload.message || payload.error);
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error('The financial market-data response was invalid.');
  }
  return payload as FinancialMarketDataPage;
}

export async function getAdminFinancialMarketDataSources(): Promise<AdminFinancialMarketDataSource[]> {
  const { data, error } = await supabase.rpc('admin_financial_market_data_source_config');
  fail(error, 'Financial market-data sources could not be loaded.');
  return (Array.isArray(data) ? data : []) as AdminFinancialMarketDataSource[];
}

export async function setAdminFinancialMarketDataSourceStatus(input: {
  code: string;
  status: 'ACTIVE' | 'DISABLED';
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_set_financial_market_data_source_status', {
    p_code: input.code,
    p_status: input.status,
    p_reason: input.reason.trim(),
  });
  fail(error, 'Financial market-data source status could not be changed.');
  return Boolean(data);
}
