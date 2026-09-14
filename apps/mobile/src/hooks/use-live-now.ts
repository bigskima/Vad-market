import { useCallback, useSyncExternalStore } from 'react';

let currentNow = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function emit() {
  currentNow = Date.now();
  listeners.forEach((listener) => listener());
}

function startClock() {
  if (timer) return;
  currentNow = Date.now();
  timer = setInterval(emit, 1000);
}

function stopClock() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  startClock();

  return () => {
    listeners.delete(listener);
    if (!listeners.size) stopClock();
  };
}

const serverSnapshot = Date.now();

function quantize(value: number, resolutionMs: number) {
  if (resolutionMs <= 1000) return value;
  return Math.floor(value / resolutionMs) * resolutionMs;
}

export function useLiveNow(resolutionMs = 1000) {
  const getSnapshot = useCallback(
    () => quantize(currentNow, resolutionMs),
    [resolutionMs],
  );
  const getServerSnapshot = useCallback(
    () => quantize(serverSnapshot, resolutionMs),
    [resolutionMs],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
