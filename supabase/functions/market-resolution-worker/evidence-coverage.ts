export type EvidencePath = 'DIRECT' | 'SEARCH';

type PacketSource = { source: EvidencePath };
type CitedSource = { source: PacketSource };

export function missingEvidencePaths(
  evidence: ReadonlyArray<CitedSource>,
  packet: ReadonlyArray<PacketSource>,
): EvidencePath[] {
  const available = new Set(packet.map((source) => source.source));
  return [...available].filter((sourceType) =>
    !evidence.some((item) => item.source.source === sourceType)
  );
}

/** Accept any validated public host when no explicit domain allow-list is published. */
export function isAllowedEvidenceHost(hostname: string, allowedDomains: ReadonlyArray<string>): boolean {
  const host = hostname.trim().toLowerCase().replace(/\\.$/, '');
  if (!host) return false;
  if (allowedDomains.length === 0) return true;
  return allowedDomains.some((candidate) => {
    const allowed = candidate.trim().toLowerCase().replace(/\\.$/, '');
    return Boolean(allowed) && (host === allowed || host.endsWith('.' + allowed));
  });
}

/**
 * For automatically discovered (unscoped) evidence, prefer corroborating
 * search evidence from a different registrable-host boundary. Subdomains of
 * the selected direct page do not count as independent hosts.
 */
export function hasIndependentEvidenceHost(candidateHost: string, primaryHost: string): boolean {
  const candidate = candidateHost.trim().toLowerCase().replace(/\\.$/, '');
  const primary = primaryHost.trim().toLowerCase().replace(/\\.$/, '');
  if (!candidate || !primary || candidate === primary) return false;
  return !candidate.endsWith('.' + primary) && !primary.endsWith('.' + candidate);
}
