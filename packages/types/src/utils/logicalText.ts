/**
 * Empty-block storage sentinel (I11, `spec-v2/03-selection.md` §2).
 *
 * This is the only definition site. Import `EMPTY_BLOCK_SENTINEL` from
 * `@input/pen-types`. Do not redeclare `"\u200B"`, `ZERO_WIDTH`, or a
 * local copy — a redeclared constant keeps passing after the seam it
 * was meant to shadow has changed.
 *
 * Produced by normalize / op executors (storage-side, marked
 * `sentinel-storage`) so an otherwise-empty block has a caret target.
 * Not a logical character.
 *
 * The two sanctioned consumer seams are `logicalTextFromStored` (this
 * module) and `offsetDomain.ts` in `@input/pen-dom`. Do not add new
 * equality or `replaceAll` tests against this value. A user-typed
 * zero-width space in non-empty text is real content; only a block
 * whose stored text is exactly the sentinel is empty.
 */
export const EMPTY_BLOCK_SENTINEL = "\u200B";

/**
 * Resolve stored block text into the logical text domain (I11).
 *
 * A block whose stored text is exactly `EMPTY_BLOCK_SENTINEL` reads as
 * `""`. Any other stored string — including one that contains a
 * zero-width space — is returned unchanged.
 *
 * Serialization and renderer packages import this instead of stripping
 * the sentinel themselves. The function stays next to the constant so
 * consumers that do not depend on `@input/pen-core` (export-json,
 * crdt-yjs neighbors) share one home without a dependency inversion.
 */
export function logicalTextFromStored(stored: string): string {
	return stored === EMPTY_BLOCK_SENTINEL ? "" : stored;
}
