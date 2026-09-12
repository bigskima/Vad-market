export type TourRoute = '/home' | '/markets' | '/wallet' | '/portfolio' | '/account';

export type TourStep = {
  id: string;
  targetId: string;
  route: TourRoute;
  title: string;
  body: string;
  sequence?: number;
  metadata?: Record<string, unknown>;
};

export type TourProgressStatus = 'NEW' | 'IN_PROGRESS' | 'REMIND' | 'COMPLETED' | 'DISMISSED';

export type TourProgress = {
  status: TourProgressStatus;
  tourVersion: string;
  tourVersionId: number | null;
  currentStepKey: string | null;
  remindAt: string | null;
  completedAt: string | null;
  lastStartedAt: string | null;
};

export type TourTargetRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const DEFAULT_TOUR_PROGRESS: TourProgress = {
  status: 'NEW',
  tourVersion: '',
  tourVersionId: null,
  currentStepKey: null,
  remindAt: null,
  completedAt: null,
  lastStartedAt: null,
};
