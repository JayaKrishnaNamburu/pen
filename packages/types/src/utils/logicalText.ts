/**
 * Empty-block storage sentinel (I11). Produced by normalize / op executors
 * so an otherwise-empty block has a caret target. Not a logical character.
 *
 * Do not `replaceAll` it — a user-typed zero-width space in non-empty text
 * is real content, and only a block whose stored text is exactly the
 * sentinel is empty.
 */
export const EMPTY_BLOCK_SENTINEL = "\u200B";

/**
 * Resolve stored block text into the logical text domain.
 * A block whose stored text is exactly the empty-block sentinel reads as `""`.
 */
export function logicalTextFromStored(stored: string): string {
	return stored === EMPTY_BLOCK_SENTINEL ? "" : stored;
}
