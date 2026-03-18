import type { BlockDecoration } from "@pen/types";
import type { GenerationState } from "../types";

export function buildGenerationZoneDecorations(
	generation: GenerationState | null,
): BlockDecoration[] {
	if (!generation) return [];
	return [{
		type: "block",
		blockId: generation.blockId,
		attributes: {
			"data-ai-generating": generation.status === "streaming",
			"data-generation-zone-id": generation.zoneId,
			"data-generation-status": generation.status,
		},
	}];
}
