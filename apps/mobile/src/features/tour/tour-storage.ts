import Storage from 'expo-sqlite/kv-store';

import { VAD_TOUR_VERSION } from './tour-catalog';
import { DEFAULT_TOUR_PROGRESS, type TourProgress } from './tour-types';

const TOUR_PROGRESS_KEY = 'vad.product-tour.progress.v1';

export async function readTourProgress(): Promise<TourProgress> {
  try {
    const stored = await Storage.getItem(TOUR_PROGRESS_KEY);
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

export async function writeTourProgress(progress: TourProgress) {
  try {
    await Storage.setItem(TOUR_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Tour persistence must never prevent the app itself from working.
  }
}
