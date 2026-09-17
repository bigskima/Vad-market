import { useMemo, useState } from 'react';

type ProgressiveState = {
  key: string;
  count: number;
};

export function useProgressiveList<T>({
  items,
  initialCount = 6,
  step = initialCount,
  resetKey,
}: {
  items: T[];
  initialCount?: number;
  step?: number;
  resetKey?: string;
}) {
  const currentKey = `${resetKey ?? ''}|${initialCount}`;
  const [state, setState] = useState<ProgressiveState>(() => ({ key: currentKey, count: initialCount }));
  const visibleCount = state.key === currentKey ? state.count : initialCount;

  const visibleItems = useMemo(
    () => items.slice(0, Math.min(visibleCount, items.length)),
    [items, visibleCount],
  );
  const remainingCount = Math.max(0, items.length - visibleItems.length);
  const nextCount = Math.min(step, remainingCount);

  return {
    visibleItems,
    visibleCount: visibleItems.length,
    totalCount: items.length,
    remainingCount,
    hasMore: remainingCount > 0,
    nextCount,
    showMore: () => setState({ key: currentKey, count: Math.min(items.length, visibleCount + step) }),
    showAll: () => setState({ key: currentKey, count: items.length }),
    collapse: () => setState({ key: currentKey, count: initialCount }),
  };
}
