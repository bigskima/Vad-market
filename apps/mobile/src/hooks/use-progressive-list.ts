import { useEffect, useMemo, useState } from 'react';

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
  const [visibleCount, setVisibleCount] = useState(initialCount);

  useEffect(() => {
    setVisibleCount(initialCount);
  }, [initialCount, resetKey]);

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
    showMore: () => setVisibleCount((count) => Math.min(items.length, count + step)),
    showAll: () => setVisibleCount(items.length),
    collapse: () => setVisibleCount(initialCount),
  };
}
