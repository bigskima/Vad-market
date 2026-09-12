import { router, usePathname } from 'expo-router';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Modal, View, useWindowDimensions } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadText } from '@/components/ui/vad-text';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getMyProductTour,
  setMyProductTourProgress,
  type ProductTourDefinition,
} from './tour-service';
import {
  DEFAULT_TOUR_PROGRESS,
  type TourProgress,
  type TourProgressStatus,
  type TourStep,
  type TourTargetRect,
} from './tour-types';

type TargetNode = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

type ScrollController = {
  ensureVisible: (rect: TourTargetRect) => boolean;
};

type TourContextValue = {
  active: boolean;
  available: boolean;
  loading: boolean;
  error: string | null;
  progress: TourProgress;
  currentStep: TourStep | null;
  currentStepNumber: number;
  totalSteps: number;
  registerTarget: (targetId: string, node: TargetNode | null) => void;
  registerScrollController: (controller: ScrollController | null) => void;
  startTour: (manual?: boolean) => void;
  refreshTour: () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function ProductTourProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const { height: windowHeight } = useWindowDimensions();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [definition, setDefinition] = useState<ProductTourDefinition | null>(null);
  const [progress, setProgress] = useState<TourProgress>(DEFAULT_TOUR_PROGRESS);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<TourTargetRect | null>(null);
  const [showReminderChoices, setShowReminderChoices] = useState(false);
  const targetsRef = useRef(new Map<string, TargetNode>());
  const scrollControllerRef = useRef<ScrollController | null>(null);
  const autoStartedRef = useRef(false);

  const steps = definition?.steps ?? [];
  const progressReady = Boolean(userId && loadedUserId === userId);
  const currentStep = active ? (steps[stepIndex] ?? null) : null;

  const registerTarget = useCallback((targetId: string, node: TargetNode | null) => {
    if (node) targetsRef.current.set(targetId, node);
    else targetsRef.current.delete(targetId);
  }, []);

  const registerScrollController = useCallback((controller: ScrollController | null) => {
    scrollControllerRef.current = controller;
  }, []);

  const loadTour = useCallback(async () => {
    if (!userId) return null;
    setLoading(true);
    setError(null);
    try {
      const next = await getMyProductTour();
      setDefinition(next);
      setProgress(next.progress);
      setLoadedUserId(userId);
      return next;
    } catch (loadError) {
      setDefinition(null);
      setProgress(DEFAULT_TOUR_PROGRESS);
      setLoadedUserId(userId);
      setError(loadError instanceof Error
        ? loadError.message
        : 'The guided tour is unavailable right now. You can try again later from Account.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const saveProgress = useCallback((
    status: Exclude<TourProgressStatus, 'NEW'>,
    currentStepKey: string | null,
    remindAt: string | null = null,
  ) => {
    const versionId = definition?.versionId;
    if (!definition?.available || !versionId) return;

    const now = new Date().toISOString();
    const optimistic: TourProgress = {
      ...progress,
      status,
      tourVersion: definition.version,
      tourVersionId: versionId,
      currentStepKey,
      remindAt: status === 'REMIND' ? remindAt : null,
      completedAt: status === 'COMPLETED' ? now : status === 'IN_PROGRESS' ? null : progress.completedAt,
      lastStartedAt: status === 'IN_PROGRESS' ? now : progress.lastStartedAt,
    };
    setProgress(optimistic);

    void setMyProductTourProgress({
      tourCode: definition.tourCode,
      tourVersionId: versionId,
      status,
      currentStepKey,
      remindAt,
    }).then((stored) => {
      setProgress((current) => ({
        ...current,
        ...stored,
        tourVersion: definition.version,
        tourVersionId: versionId,
      }));
    }).catch((saveError) => {
      setError(saveError instanceof Error
        ? saveError.message
        : 'We could not save your guided tour progress. Please try again.');
    });
  }, [definition, progress]);

  const beginWithDefinition = useCallback((tour: ProductTourDefinition, manual: boolean) => {
    if (!tour.available || !tour.versionId || !tour.steps.length) return;
    autoStartedRef.current = true;

    let nextIndex = 0;
    if (!manual && tour.progress.status === 'IN_PROGRESS' && tour.progress.currentStepKey) {
      const savedIndex = tour.steps.findIndex((step) => step.id === tour.progress.currentStepKey);
      if (savedIndex >= 0) nextIndex = savedIndex;
    }

    const step = tour.steps[nextIndex];
    const now = new Date().toISOString();
    const nextProgress: TourProgress = {
      ...tour.progress,
      status: 'IN_PROGRESS',
      tourVersion: tour.version,
      tourVersionId: tour.versionId,
      currentStepKey: step.id,
      remindAt: null,
      completedAt: null,
      lastStartedAt: now,
    };

    setDefinition(tour);
    setProgress(nextProgress);
    setStepIndex(nextIndex);
    setSpotlight(null);
    setShowReminderChoices(false);
    setActive(true);
    setError(null);

    void setMyProductTourProgress({
      tourCode: tour.tourCode,
      tourVersionId: tour.versionId,
      status: 'IN_PROGRESS',
      currentStepKey: step.id,
    }).catch((saveError) => {
      setError(saveError instanceof Error
        ? saveError.message
        : 'We could not save your guided tour progress. Please try again.');
    });

    const destination = manual ? '/home' : step.route;
    if (pathname !== destination) router.replace(destination);
  }, [pathname]);

  const startTour = useCallback((manual = false) => {
    if (!userId) return;
    autoStartedRef.current = true;
    void (async () => {
      const tour = definition?.available ? definition : await loadTour();
      if (!tour) return;
      beginWithDefinition(tour, manual);
    })();
  }, [beginWithDefinition, definition, loadTour, userId]);

  useEffect(() => {
    autoStartedRef.current = false;
    setActive(false);
    setSpotlight(null);
    setShowReminderChoices(false);

    if (!userId) {
      setDefinition(null);
      setProgress(DEFAULT_TOUR_PROGRESS);
      setLoadedUserId(null);
      setError(null);
      return;
    }

    void loadTour();
  }, [loadTour, userId]);

  useEffect(() => {
    if (
      !userId
      || !progressReady
      || loading
      || active
      || pathname !== '/home'
      || autoStartedRef.current
      || !definition?.available
      || !definition.shouldStart
    ) return;

    const timer = setTimeout(() => startTour(false), 1100);
    return () => clearTimeout(timer);
  }, [active, definition, loading, pathname, progressReady, startTour, userId]);

  const revealStep = useCallback(() => {
    if (!currentStep) return;

    if (pathname !== currentStep.route) {
      setSpotlight(null);
      scrollControllerRef.current = null;
      router.replace(currentStep.route);
      return;
    }

    let cancelled = false;
    let attempt = 0;

    const measure = () => {
      if (cancelled) return;
      const node = targetsRef.current.get(currentStep.targetId);
      if (!node) {
        attempt += 1;
        if (attempt <= 24) setTimeout(measure, 90);
        return;
      }

      node.measureInWindow((x, y, width, height) => {
        if (cancelled || width <= 0 || height <= 0) return;
        const rect = { x, y, width, height };
        const controller = scrollControllerRef.current;
        const needsMovement = y < 118 || y + height > windowHeight - 270;

        if (needsMovement && controller?.ensureVisible(rect) && attempt < 3) {
          attempt += 1;
          setSpotlight(null);
          setTimeout(measure, 360);
          return;
        }

        const padding = 6;
        setSpotlight({
          x: Math.max(4, x - padding),
          y: Math.max(4, y - padding),
          width: width + padding * 2,
          height: height + padding * 2,
        });
      });
    };

    const timer = setTimeout(measure, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentStep, pathname, windowHeight]);

  useEffect(() => {
    if (!active || !currentStep) return;
    const timer = setTimeout(revealStep, 80);
    return () => clearTimeout(timer);
  }, [active, currentStep, pathname, revealStep]);

  const completeTour = useCallback(() => {
    const lastStep = steps[steps.length - 1];
    saveProgress('COMPLETED', lastStep?.id ?? null);
    setActive(false);
    setSpotlight(null);
    setShowReminderChoices(false);
    setDefinition((current) => current ? { ...current, shouldStart: false } : current);
  }, [saveProgress, steps]);

  const moveNext = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      completeTour();
      return;
    }
    const nextIndex = stepIndex + 1;
    setSpotlight(null);
    setShowReminderChoices(false);
    setStepIndex(nextIndex);
    saveProgress('IN_PROGRESS', steps[nextIndex]?.id ?? null);
  }, [completeTour, saveProgress, stepIndex, steps]);

  const moveBack = useCallback(() => {
    if (stepIndex <= 0) return;
    const nextIndex = Math.max(0, stepIndex - 1);
    setSpotlight(null);
    setShowReminderChoices(false);
    setStepIndex(nextIndex);
    saveProgress('IN_PROGRESS', steps[nextIndex]?.id ?? null);
  }, [saveProgress, stepIndex, steps]);

  const postpone = useCallback((milliseconds: number | null) => {
    const remindAt = milliseconds === null
      ? null
      : new Date(Date.now() + milliseconds).toISOString();
    saveProgress(
      milliseconds === null ? 'DISMISSED' : 'REMIND',
      currentStep?.id ?? null,
      remindAt,
    );
    setActive(false);
    setSpotlight(null);
    setShowReminderChoices(false);
    setDefinition((current) => current ? { ...current, shouldStart: false } : current);
  }, [currentStep?.id, saveProgress]);

  const value = useMemo<TourContextValue>(() => ({
    active,
    available: Boolean(definition?.available),
    loading,
    error,
    progress,
    currentStep,
    currentStepNumber: currentStep ? stepIndex + 1 : 0,
    totalSteps: steps.length,
    registerTarget,
    registerScrollController,
    startTour,
    refreshTour: () => { void loadTour(); },
  }), [
    active,
    currentStep,
    definition?.available,
    error,
    loadTour,
    loading,
    progress,
    registerScrollController,
    registerTarget,
    startTour,
    stepIndex,
    steps.length,
  ]);

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourOverlay
        active={active}
        step={currentStep}
        rect={spotlight}
        stepNumber={stepIndex + 1}
        totalSteps={steps.length}
        showReminderChoices={showReminderChoices}
        onBack={moveBack}
        onNext={moveNext}
        onSkip={() => setShowReminderChoices(true)}
        onKeepTouring={() => setShowReminderChoices(false)}
        onPostpone={postpone}
      />
    </TourContext.Provider>
  );
}

export function TourTarget({
  id,
  children,
}: PropsWithChildren<{ id: string }>) {
  const { registerTarget } = useProductTour();
  return (
    <View collapsable={false} ref={(node) => registerTarget(id, node)}>
      {children}
    </View>
  );
}

export function useProductTour() {
  const value = useContext(TourContext);
  if (!value) throw new Error('useProductTour must be used inside ProductTourProvider');
  return value;
}

function TourOverlay({
  active,
  step,
  rect,
  stepNumber,
  totalSteps,
  showReminderChoices,
  onBack,
  onNext,
  onSkip,
  onKeepTouring,
  onPostpone,
}: {
  active: boolean;
  step: TourStep | null;
  rect: TourTargetRect | null;
  stepNumber: number;
  totalSteps: number;
  showReminderChoices: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onKeepTouring: () => void;
  onPostpone: (milliseconds: number | null) => void;
}) {
  const theme = useVadTheme();
  const { width, height } = useWindowDimensions();
  if (!active || !step) return null;

  const overlay = 'rgba(3, 5, 12, 0.72)';
  const cardAbove = Boolean(rect && rect.y > height * 0.53);
  const cardPosition = rect
    ? cardAbove
      ? { bottom: Math.max(14, height - rect.y + 14) }
      : { top: Math.min(height - 250, rect.y + rect.height + 14) }
    : { top: Math.max(120, height * 0.28) };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1 }} accessibilityViewIsModal>
        {rect ? (
          <>
            <View style={{ position: 'absolute', left: 0, top: 0, width, height: Math.max(0, rect.y), backgroundColor: overlay }} />
            <View style={{ position: 'absolute', left: 0, top: rect.y, width: Math.max(0, rect.x), height: rect.height, backgroundColor: overlay }} />
            <View style={{ position: 'absolute', left: rect.x + rect.width, top: rect.y, right: 0, height: rect.height, backgroundColor: overlay }} />
            <View style={{ position: 'absolute', left: 0, top: rect.y + rect.height, right: 0, bottom: 0, backgroundColor: overlay }} />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
                borderWidth: 2,
                borderColor: theme.colors.brandAccent,
                borderRadius: Math.min(theme.radius.xl, 18),
                ...theme.shadows.floating,
              }}
            />
          </>
        ) : (
          <View style={{ ...StyleSheetAbsoluteFill, backgroundColor: overlay }} />
        )}

        <View
          style={[
            theme.shadows.floating,
            {
              position: 'absolute',
              left: width < 440 ? theme.spacing.md : undefined,
              right: width < 440 ? theme.spacing.md : undefined,
              width: width < 440 ? undefined : 390,
              alignSelf: width < 440 ? undefined : 'center',
              marginHorizontal: width < 440 ? 0 : (width - 390) / 2,
              borderRadius: theme.radius.xl,
              borderWidth: 1,
              borderColor: theme.colors.borderStrong,
              backgroundColor: theme.colors.surface,
              padding: theme.spacing.lg,
              gap: theme.spacing.md,
              ...cardPosition,
            },
          ]}
        >
          {showReminderChoices ? (
            <>
              <View style={{ gap: 5 }}>
                <VadText variant="caption" tone="brand">PAUSE THE TOUR</VadText>
                <VadText variant="heading">When should VAD remind you?</VadText>
                <VadText variant="caption" tone="secondary">
                  Finishing the tour turns automatic reminders off. You can still take it again from Account at any time.
                </VadText>
              </View>
              <View style={{ gap: theme.spacing.xs }}>
                <VadButton label="Remind me tomorrow" variant="tonal" onPress={() => onPostpone(24 * 60 * 60 * 1000)} />
                <VadButton label="Remind me in 7 days" variant="secondary" onPress={() => onPostpone(7 * 24 * 60 * 60 * 1000)} />
                <VadButton label="Remind me in 30 days" variant="secondary" onPress={() => onPostpone(30 * 24 * 60 * 60 * 1000)} />
                <VadButton label="Don't remind me automatically" variant="ghost" onPress={() => onPostpone(null)} />
                <VadButton label="Keep touring" variant="ghost" onPress={onKeepTouring} />
              </View>
            </>
          ) : (
            <>
              <View style={{ gap: 5 }}>
                <VadText variant="caption" tone="brand">STEP {stepNumber} OF {totalSteps}</VadText>
                <VadText variant="heading">{step.title}</VadText>
                <VadText tone="secondary">{step.body}</VadText>
                {!rect ? (
                  <VadText variant="caption" tone="tertiary">Moving to this part of VAD…</VadText>
                ) : null}
              </View>

              <View style={{ height: 4, borderRadius: 2, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' }}>
                <View
                  style={{
                    height: '100%',
                    width: `${Math.round((stepNumber / Math.max(totalSteps, 1)) * 100)}%`,
                    backgroundColor: theme.colors.brandPrimary,
                  }}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
                <VadButton label="Skip" variant="ghost" fullWidth={false} onPress={onSkip} />
                <View style={{ flex: 1 }} />
                <VadButton label="Back" variant="secondary" fullWidth={false} disabled={stepNumber <= 1} onPress={onBack} />
                <VadButton label={stepNumber === totalSteps ? 'Finish' : 'Next'} fullWidth={false} onPress={onNext} />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const StyleSheetAbsoluteFill = {
  position: 'absolute' as const,
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
};
