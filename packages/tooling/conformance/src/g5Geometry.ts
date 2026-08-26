import type { GeometryBlockInfo, GeometryPointRef } from "./types";

export const WAVE3_WRAP_BLOCK = "g5-wrap";
export const WAVE3_EMPTY_BLOCK = "g5-empty";
export const WAVE3_ATOMS_BLOCK = "g5-atoms";
export const WAVE3_TAIL_BLOCK = "g5-tail";
export const REMOTE_CARET_COUNT = 8;

export function sampleCaretPoints(
	blocks: readonly GeometryBlockInfo[],
): GeometryPointRef[] {
	const points: GeometryPointRef[] = [];
	for (const block of blocks) {
		const offsets = new Set<number>([0, block.length]);
		if (block.length > 1) {
			offsets.add(Math.floor(block.length / 2));
		}
		for (const offset of offsets) {
			points.push({ blockId: block.id, offset, affinity: "downstream" });
			points.push({ blockId: block.id, offset, affinity: "upstream" });
		}
	}
	return points;
}

