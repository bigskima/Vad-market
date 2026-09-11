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
import { useVadTheme } from '@/providers/theme-provider';
import { VAD_PRODUCT_TOUR, VAD_TOUR_VERSION } from './tour-catalog';
import { readTourProgress, writeTourProgress } from './tour-storage';
import {
  DEFAULT_TOUR_PROGRESS,
  type TourProgress,
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
  progress: TourProgress;
  currentStep: TourStep | null;
  currentStepNumber: number;
  totalSteps: number;
  registerTarget: (targetId: string, node: TargetNode | null) => void;
  registerScrollController: (controller: ScrollController | null) => void;
  startTour: (manual?: boolean) => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function ProductTourProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const { height: windowHeight } = useWindowDimensions();
  const [progress, setProgress] = useState<TourProgress>({
    ...DEFAULT_TOUR_PROGRESS,
    tourVersion: VAD_TOUR_VERSION,
  });
  const [progressReady, setProgressReady] = useState(false);
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<TourTargetRect | null>(null);
  const [showReminderChoices, setShowReminderChoices] = useState(false);
  const targetsRef = useRef(new Map<string, TargetNode>());
  const scrollControllerRef = useRef<ScrollController | null>(null);
  const autoStartedRef = useRef(false);

  const currentStep = active ? (VAD_PRODUCT_TOUR[stepIndex] ?? null) : null;

  const registerTarget = useCallback((targetId: string, node: TargetNode | null) => {
    if (node) targetsRef.current.set(targetId, node);
    else targetsRef.current.delete(targetId);
  }, []);

  const registerScrollController = useCallback((controller: ScrollController | null) => {
    scrollControllerRef.current = controller;
  }, []);

  const beginTour = useCallback((manual = false) => {
    autoStartedRef.current = true;
    const nextProgress: TourProgress = {
      ...progress,
      status: manual ? progress.status : progress.status,
      tourVersion: VAD_TOUR_VERSION,
      lastStartedAt: new Date().toISOString(),
    };

    setProgress(nextProgress);
    void writeTourProgress(nextProgress);
    setStepIndex(0);
    setSpotlight(null);
    setShowReminderChoices(false);
    setActive(true);
    if (pathname !== '/home') router.replace('/home');
  }, [pathname, progress]);

  useEffect(() => {
    let mounted = true;
    void readTourProgress().then((stored) => {
      if (!mounted) return;
      setProgress(stored);
      setProgressReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!progressReady || active || pathname !== '/home' || autoStartedRef.current) return;
    const due =
      progress.status === 'NEW' ||
      (progress.status === 'REMIND' &&
        Boolean(progress.remindAt) &&
        new Date(progress.remindAt ?? 0).getTime() <= Date.now());
    if (!due) return;

    const timer = setTimeout(() => beginTour(false), 1100);
    return () => clearTimeout(timer);
  }, [active, beginTour, pathname, progress, progressReady]);

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
    const timer = setTimeout(() => {
      revealStep();
    }, 80);
    return () => clearTimeout(timer);
  }, [active, currentStep, pathname, revealStep]);

  const completeTour = useCallback(() => {
    const nextProgress: TourProgress = {
      status: 'COMPLETED',
      tourVersion: VAD_TOUR_VERSION,
      remindAt: null,
      completedAt: new Date().toISOString(),
      lastStartedAt: progress.lastStartedAt ?? new Date().toISOString(),
    };
    setProgress(nextProgress);
    void writeTourProgress(nextProgress);
    setActive(false);
    setSpotlight(null);
    setShowReminderChoices(false);
  }, [progress.lastStartedAt]);

  const moveNext = useCallback(() => {
    if (stepIndex >= VAD_PRODUCT_TOUR.length - 1) {
      completeTour();
      return;
    }
    setSpotlight(null);
    setShowReminderChoices(false);
    setStepIndex((value) => value + 1);
  }, [completeTour, stepIndex]);

  const moveBack = useCallback(() => {
    if (stepIndex <= 0) return;
    setSpotlight(null);
    setShowReminderChoices(false);
    setStepIndex((value) => Math.max(0, value - 1));
  }, [stepIndex]);

  const postpone = useCallback((milliseconds: number | null) => {
    const nextProgress: TourProgress = {
      ...progress,
      status: milliseconds === null ? 'DISMISSED' : 'REMIND',
      tourVersion: VAD_TOUR_VERSION,
      remindAt: milliseconds === null
        ? null
        : new Date(Date.now() + milliseconds).toISOString(),
    };
    setProgress(nextProgress);
    void writeTourProgress(nextProgress);
    setActive(false);
    setSpotlight(null);
    setShowReminderChoices(false);
  }, [progress]);

  const value = useMemo<TourContextValue>(() => ({
    active,
    progress,
    currentStep,
    currentStepNumber: currentStep ? stepIndex + 1 : 0,
    totalSteps: VAD_PRODUCT_TOUR.length,
    registerTarget,
    registerScrollController,
    startTour: beginTour,
  }), [active, beginTour, currentStep, progress, registerScrollController, registerTarget, stepIndex]);

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourOverlay
        active={active}
        step={currentStep}
        rect={spotlight}
        stepNumber={stepIndex + 1}
        totalSteps={VAD_PRODUCT_TOUR.length}
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
    <View
      collapsable={false}
      ref={(node) => registerTarget(id, node)}
    >
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
                    width: `${Math.round((stepNumber / totalSteps) * 100)}%`,
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
