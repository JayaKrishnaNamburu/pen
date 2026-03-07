import type { PenStreamPart } from "@pen/types";

export function generateGenDeltaParts(
  count: number,
  blockId: string,
): PenStreamPart[] {
  const parts: PenStreamPart[] = [
    { type: "gen-start", zoneId: "bench-zone", blockId },
  ];

  for (let i = 0; i < count; i++) {
    parts.push({
      type: "gen-delta",
      zoneId: "bench-zone",
      delta: `token-${i} `,
    } as PenStreamPart);
  }

  parts.push({
    type: "gen-end",
    zoneId: "bench-zone",
    status: "complete",
  } as PenStreamPart);

  return parts;
}
