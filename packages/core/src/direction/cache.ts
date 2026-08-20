import type { BlockDirection } from "./firstStrong";

export type DirectionCacheEntry = {
	fingerprint: string;
	direction: BlockDirection;
};

export type DirectionCache = {
	get(
		blockId: string,
		text: string,
		props?: Record<string, unknown> | null,
		facetEpoch?: number,
	): BlockDirection | undefined;
	set(
		blockId: string,
		text: string,
		props: Record<string, unknown> | null | undefined,
		direction: BlockDirection,
		facetEpoch?: number,
	): void;
	invalidate(blockId: string): void;
	clear(): void;
};

function directionSetting(
	props?: Record<string, unknown> | null,
): string {
	if (props == null) {
		return "";
	}
	const value = props.direction;
	return typeof value === "string" ? value : "";
}

/** DIR1: fingerprint of the inputs that invalidate a cached resolution. */
export function fingerprintDirectionInput(
	text: string,
	props?: Record<string, unknown> | null,
	facetEpoch = 0,
): string {
	return `${facetEpoch}\0${directionSetting(props)}\0${text}`;
}

/**
 * DIR1 cache: one entry per blockId, keyed against a text/props/facet fingerprint.
 * A mismatch drops that block. `invalidate` is the summary-driven path; `clear`
 * is the facet-output path. No editor hook.
 */
export function createDirectionCache(): DirectionCache {
	const entries = new Map<string, DirectionCacheEntry>();

	return {
		get(blockId, text, props, facetEpoch = 0) {
			const entry = entries.get(blockId);
			if (!entry) {
				return undefined;
			}
			const fingerprint = fingerprintDirectionInput(text, props, facetEpoch);
			if (entry.fingerprint !== fingerprint) {
				entries.delete(blockId);
				return undefined;
			}
			return entry.direction;
		},
		set(blockId, text, props, direction, facetEpoch = 0) {
			entries.set(blockId, {
				fingerprint: fingerprintDirectionInput(text, props, facetEpoch),
				direction,
			});
		},
		invalidate(blockId) {
			entries.delete(blockId);
		},
		clear() {
			entries.clear();
		},
	};
}
