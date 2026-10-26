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
