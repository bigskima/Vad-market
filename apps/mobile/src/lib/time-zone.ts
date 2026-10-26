/**
 * Explicitly formats absolute timestamps in the device's current time zone.
 * API/DB dates should be ISO-8601 timestamps with Z or an explicit UTC offset.
 */
export function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'device local time';
  } catch {
    return 'device local time';
  }
}

export function formatDateTimeInDeviceZone(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);

  let formatted = date.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const zone = getDeviceTimeZone();
  if (zone !== 'device local time' && !formatted.toLowerCase().includes(zone.toLowerCase())) {
    formatted += ' (' + zone + ')';
  }
  return formatted;
}

/** Reject timezone-naive fixture timestamps before converting them into UTC. */
export function hasExplicitTimeZone(value: string): boolean {
  return /T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
}
