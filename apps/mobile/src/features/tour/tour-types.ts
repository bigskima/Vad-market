export type TourRoute = '/home' | '/markets' | '/wallet' | '/portfolio' | '/account';

export type TourStep = {
  id: string;
  targetId: string;
  route: TourRoute;
  title: string;
  body: string;
};

export type TourProgressStatus = 'NEW' | 'REMIND' | 'COMPLETED' | 'DISMISSED';

export type TourProgress = {
  status: TourProgressStatus;
  tourVersion: string;
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
  tourVersion: '2026.09',
  remindAt: null,
  completedAt: null,
  lastStartedAt: null,
};
