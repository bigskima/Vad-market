import { type LegislativeAdjournmentSpec, type OracleResource, OracleRuntimeError, type ProviderResolutionResult } from './types.ts';

function minutesSinceMidnight(hour: number, minute: number, meridiem: string) {
  let h = hour % 12;
  if (meridiem.toUpperCase() === 'PM') h += 12;
  return h * 60 + minute;
}

function cutoffMinutes(value: string) {
  const m = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) throw new OracleRuntimeError('RESOLUTION_SCOPE_INVALID', 'Legislative cutoff time is invalid', 422);
  return minutesSinceMidnight(Number(m[1]), Number(m[2]), m[3]);
}

export async function resolveLegislativeAdjournment(
  resource: OracleResource,
  spec: LegislativeAdjournmentSpec,
): Promise<ProviderResolutionResult> {
  const url = resource.externalKey;
  if (!/^https:\/\/(www\.)?senate\.gov\//i.test(url)) {
    throw new OracleRuntimeError('PUBLIC_RECORD_HOST_NOT_ALLOWED', 'Legislative resolver only accepts the configured official senate.gov source', 422);
  }

  let response: Response;
  try {
    response = await fetch(url, { headers: { 'User-Agent': 'VAD-Oracle/1.0 (+public-record-verification)' } });
  } catch {
    throw new OracleRuntimeError('PROVIDER_NETWORK_ERROR', 'Official public record could not be reached', 503);
  }
  if (!response.ok) {
    throw new OracleRuntimeError(`PROVIDER_HTTP_${response.status}`, 'Official public record request failed', response.status >= 500 ? 503 : 422);
  }

  const html = await response.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ');

  const [year, month, day] = spec.legislativeDate.split('-').map(Number);
  const monthName = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
  const datePattern = new RegExp(`${monthName}\\.?\\s+${day},\\s+${year}`, 'i');
  const dateMatch = datePattern.exec(text);
  if (!dateMatch) return { kind: 'skipped', code: 'OFFICIAL_RECORD_NOT_PUBLISHED', detail: 'Target legislative day is not yet present in the official source' };

  const start = Math.max(0, dateMatch.index - 120);
  const segment = text.slice(start, dateMatch.index + 700);
  const adjourn = segment.match(/adjourned\s+at\s+(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)/i);
  if (!adjourn) return { kind: 'skipped', code: 'OFFICIAL_RECORD_INCONCLUSIVE', detail: 'Official source has the legislative day but no final adjournment time yet' };

  const meridiem = adjourn[3].toUpperCase().startsWith('P') ? 'PM' : 'AM';
  const observedMinutes = minutesSinceMidnight(Number(adjourn[1]), Number(adjourn[2]), meridiem);
  const thresholdMinutes = cutoffMinutes(spec.cutoffLocalTime);
  const outcome = observedMinutes <= thresholdMinutes ? 'YES' : 'NO';

  return {
    kind: 'observation',
    observation: {
      observedOutcome: outcome,
      observedAt: new Date(),
      evidenceReference: url,
      payload: {
        source: 'United States Senate',
        source_host: 'senate.gov',
        legislative_date: spec.legislativeDate,
        adjournment_local_time: `${adjourn[1]}:${adjourn[2]} ${meridiem}`,
        cutoff_local_time: spec.cutoffLocalTime,
        timezone: spec.timeZone,
        resolver: 'LEGISLATIVE_SESSION_ADJOURNMENT_V1',
      },
    },
  };
}
