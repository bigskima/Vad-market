import { getProductLocalItem, setProductLocalItem } from '@/services/product-local-storage';
import { VAD_TOUR_VERSION } from './tour-catalog';
import { DEFAULT_TOUR_PROGRESS, type TourProgress } from './tour-types';

const TOUR_PROGRESS_PREFIX = 'vad.product-tour.progress.v1';

function progressKey(userId: string) {
  return `${TOUR_PROGRESS_PREFIX}.${userId}`;
}

export async function readTourProgress(userId: string): Promise<TourProgress> {
  try {
    const stored = await getProductLocalItem(progressKey(userId));
    if (!stored) return { ...DEFAULT_TOUR_PROGRESS, tourVersion: VAD_TOUR_VERSION };

    const parsed = JSON.parse(stored) as Partial<TourProgress>;
    if (parsed.tourVersion !== VAD_TOUR_VERSION) {
      return { ...DEFAULT_TOUR_PROGRESS, tourVersion: VAD_TOUR_VERSION };
    }

    return {
      ...DEFAULT_TOUR_PROGRESS,
      ...parsed,
      tourVersion: VAD_TOUR_VERSION,
    };
  } catch {
    return { ...DEFAULT_TOUR_PROGRESS, tourVersion: VAD_TOUR_VERSION };
  }
}

export async function writeTourProgress(userId: string, progress: TourProgress) {
  await setProductLocalItem(progressKey(userId), JSON.stringify(progress));
}
