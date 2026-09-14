import { useSyncExternalStore } from 'react';

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

function getSnapshot() {
  return currentNow;
}

const serverSnapshot = Date.now();

export function useLiveNow() {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}
