import type { Assoc } from "./changes";

export type { Assoc };

/**
 * A resolved document location in the logical text domain (AN1, AN10).
 */
export interface AnchorTarget {
	readonly blockId: string;
	readonly offset: number;
	readonly cell?: { readonly row: number; readonly col: number };
}

/**
 * A frozen CRDT-relative position minted against one block or cell (AN12).
 */
export interface Anchor {
	readonly kind: "anchor";
	readonly blockId: string;
	readonly assoc: Assoc;
	readonly cell?: { readonly row: number; readonly col: number };
	readonly position: Uint8Array;
	readonly provenance: "local" | "wire";
}

/**
 * A pair of anchors that bound a range (AN5).
 */
export interface AnchorRange {
	readonly kind: "anchor-range";
	readonly from: Anchor;
	readonly to: Anchor;
}

/**
 * A resolved {@link AnchorRange} plus the AN5 collapse signal.
 */
export interface ResolvedAnchorRange {
	readonly from: AnchorTarget;
	readonly to: AnchorTarget;
	readonly collapsed: boolean;
}

/**
 * Resolver flag for {@link CRDTAdapter.resolveRelativePosition} (AN13).
 *
 * Local-provenance anchors pass `true`; wire-provenance anchors pass `false`.
 */
export interface ResolveRelativePositionOptions {
	readonly followUndoneDeletions?: boolean;
}

/**
 * Editor-facing anchor mint, resolve, and wire surface (AN6, AN8, AN9, AN11).
 */
export interface EditorAnchors {
	/** Mint a local-provenance anchor, or `null` plus `anchor-target-missing` if the target is gone. */
	create(target: AnchorTarget, assoc?: Assoc): Anchor | null;
	/** Mint a range (`from` assoc `-1`, `to` assoc `1`), or `null` if either end is missing. */
	range(range: {
		anchor: AnchorTarget;
		focus: AnchorTarget;
	}): AnchorRange | null;
	/** Resolve to a live target, or `null` (AN1). */
	resolve(anchor: Anchor): AnchorTarget | null;
	/** Resolve both ends and set `collapsed` when they meet (AN5). */
	resolveRange(range: AnchorRange): ResolvedAnchorRange | null;
	/** Encode the v1 wire JSON (AN11). */
	serialize(anchor: Anchor): string;
	/** Decode untrusted input; never throws (AN6). */
	deserialize(input: string): Anchor | null;
	/** Live minted-or-deserialized count for the AN9 budget. */
	readonly liveCount: number;
}
