import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_TOUR_PROGRESS,
  type TourProgress,
  type TourProgressStatus,
  type TourRoute,
  type TourStep,
} from './tour-types';

export type ProductTourDefinition = {
  available: boolean;
  tourCode: string;
  name: string;
  versionId: number | null;
  version: string;
  shouldStart: boolean;
  steps: TourStep[];
  progress: TourProgress;
};

type RawTour = {
  available?: boolean;
  tourCode?: string;
  name?: string;
  versionId?: number | string | null;
  version?: string;
  shouldStart?: boolean;
  steps?: unknown[];
  progress?: Partial<TourProgress> & { tourVersionId?: number | string | null };
};

function fail(
  error: { message: string; code?: string; details?: string; hint?: string } | null,
  fallback: string,
) {
  if (error) throw userFacingError(error, 'general', fallback);
}

function isTourRoute(value: unknown): value is TourRoute {
  return value === '/home'
    || value === '/markets'
    || value === '/wallet'
    || value === '/portfolio'
    || value === '/account';
}

function normalizeSteps(value: unknown): TourStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== 'string'
      || typeof row.targetId !== 'string'
      || !isTourRoute(row.route)
      || typeof row.title !== 'string'
      || typeof row.body !== 'string'
    ) return [];

    return [{
      id: row.id,
      targetId: row.targetId,
      route: row.route,
      title: row.title,
      body: row.body,
      sequence: typeof row.sequence === 'number' ? row.sequence : undefined,
      metadata: row.metadata && typeof row.metadata === 'object'
        ? row.metadata as Record<string, unknown>
        : undefined,
    } satisfies TourStep];
  });
}

function normalizeProgress(raw: RawTour['progress'], version: string, versionId: number | null): TourProgress {
  const status = raw?.status;
  const normalizedStatus: TourProgressStatus = status === 'IN_PROGRESS'
    || status === 'REMIND'
    || status === 'COMPLETED'
    || status === 'DISMISSED'
    ? status
    : 'NEW';

  return {
    ...DEFAULT_TOUR_PROGRESS,
    status: normalizedStatus,
    tourVersion: version,
    tourVersionId: raw?.tourVersionId == null
      ? versionId
      : Number(raw.tourVersionId),
    currentStepKey: typeof raw?.currentStepKey === 'string' ? raw.currentStepKey : null,
    remindAt: typeof raw?.remindAt === 'string' ? raw.remindAt : null,
    completedAt: typeof raw?.completedAt === 'string' ? raw.completedAt : null,
    lastStartedAt: typeof raw?.lastStartedAt === 'string' ? raw.lastStartedAt : null,
  };
}

export async function getMyProductTour(tourCode = 'GETTING_STARTED'): Promise<ProductTourDefinition> {
  const { data, error } = await supabase.rpc('my_product_tour', {
    p_tour_code: tourCode,
  });
  fail(error, 'The guided tour is unavailable right now. You can try again from Account later.');

  const raw = (data ?? {}) as RawTour;
  const versionId = raw.versionId == null ? null : Number(raw.versionId);
  const version = typeof raw.version === 'string' ? raw.version : '';
  const steps = normalizeSteps(raw.steps);

  return {
    available: Boolean(raw.available && versionId && steps.length),
    tourCode: typeof raw.tourCode === 'string' ? raw.tourCode : tourCode,
    name: typeof raw.name === 'string' ? raw.name : 'Getting started with VAD',
    versionId,
    version,
    shouldStart: Boolean(raw.shouldStart),
    steps,
    progress: normalizeProgress(raw.progress, version, versionId),
  };
}

export async function setMyProductTourProgress(input: {
  tourCode: string;
  tourVersionId: number;
  status: Exclude<TourProgressStatus, 'NEW'>;
  currentStepKey?: string | null;
  remindAt?: string | null;
}) {
  const { data, error } = await supabase.rpc('set_my_product_tour_progress', {
    p_tour_code: input.tourCode,
    p_tour_version_id: input.tourVersionId,
    p_status: input.status,
    p_current_step_key: input.currentStepKey ?? null,
    p_remind_at: input.remindAt ?? null,
  });
  fail(error, 'We could not save your guided tour progress. Please try again.');

  const raw = (data ?? {}) as Partial<TourProgress> & { tourVersionId?: number | string | null };
  return normalizeProgress(raw, '', input.tourVersionId);
}
