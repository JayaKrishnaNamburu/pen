import type { PenStreamPart, StreamingTarget } from "@input/pen-types";

export const STREAMING_GEN_DELTA_ZONE_ID = "bench-zone";

export function generateGenDeltaParts(
	count: number,
	blockId: string,
): PenStreamPart[] {
	const parts: PenStreamPart[] = [
		{ type: "gen-start", zoneId: STREAMING_GEN_DELTA_ZONE_ID, blockId },
	];

	for (let i = 0; i < count; i++) {
		parts.push({
			type: "gen-delta",
			zoneId: STREAMING_GEN_DELTA_ZONE_ID,
			delta: `token-${i} `,
		});
	}

	parts.push({
		type: "gen-end",
		zoneId: STREAMING_GEN_DELTA_ZONE_ID,
		status: "complete",
	});

	return parts;
}

export function countGenDeltaParts(parts: readonly PenStreamPart[]): number {
	return parts.filter((part) => part.type === "gen-delta").length;
}

export function lastGenDeltaText(parts: readonly PenStreamPart[]): string {
	for (let i = parts.length - 1; i >= 0; i--) {
		const part = parts[i];
		if (part?.type === "gen-delta") {
			return part.delta;
		}
	}
	return "";
}

/**
 * A helper that is not consulted cannot fail. The streaming clock
 * refuses to start unless generateGenDeltaParts produced the claimed
 * gen-delta population.
 */
export function assertGenDeltaPartsFeedClock(
	parts: readonly PenStreamPart[],
	expectedCount: number,
): { lastDelta: string } {
	const deltaCount = countGenDeltaParts(parts);
	if (deltaCount !== expectedCount) {
		throw new Error(
			`generateGenDeltaParts produced ${deltaCount} gen-delta parts, expected ${expectedCount}`,
		);
	}
	const lastDelta = lastGenDeltaText(parts);
	if (lastDelta.length === 0) {
		throw new Error("generateGenDeltaParts produced no gen-delta text");
	}
	return { lastDelta };
}

/**
 * Post-clock observation of a named block. An empty helper or a
 * skipped consume cannot publish a fast time.
 */
export function assertStreamingBlockReceivedDelta(
	blockId: string,
	text: string,
	delta: string,
): void {
	if (!text.includes(delta)) {
		throw new Error(
			`streaming bench block ${blockId} missing last gen-delta ${JSON.stringify(delta)}: ${JSON.stringify(text)}`,
		);
	}
}

export async function consumeGenDeltaParts(
	streaming: StreamingTarget,
	parts: readonly PenStreamPart[],
	yieldEvery: number,
	flushMacrotask: () => Promise<void>,
): Promise<{ deltaCount: number }> {
	let deltaCount = 0;
	for (const part of parts) {
		if (part.type === "gen-start") {
			streaming.beginStreaming(part.zoneId, part.blockId);
			continue;
		}
		if (part.type === "gen-delta") {
			streaming.appendDelta(part.delta);
			if (deltaCount % yieldEvery === 0) {
				await flushMacrotask();
			}
			deltaCount += 1;
			continue;
		}
		if (part.type === "gen-end") {
			streaming.endStreaming(part.status);
		}
	}
	return { deltaCount };
}
