import type { Assoc, TextSplice } from "@input/pen-types";

/**
 * The splice helper is a function, not an algebra. `mapOffsetThroughSplices`
 * is a pure convenience for derived-tier providers shifting per-block results
 * within **one** summary. Clamp semantics only. There is no `compose`, no
 * multi-summary form, no map modes, and no cross-commit law: code that needs a
 * position to survive more than one commit uses an anchor (I13).
 */
export function mapOffsetThroughSplices(
	splices: readonly TextSplice[],
	offset: number,
	assoc: Assoc,
): number {
	let delta = 0;
	for (const splice of splices) {
		const deleted = splice.to - splice.from;
		if (offset < splice.from) {
			return offset + delta;
		}
		if (splice.from < offset && offset < splice.to) {
			return splice.from + delta;
		}
		if (offset === splice.from) {
			if (splice.insertLength > 0) {
				return assoc === -1
					? splice.from + delta
					: splice.from + delta + splice.insertLength;
			}
			if (deleted > 0) {
				return splice.from + delta;
			}
			continue;
		}
		if (offset === splice.to && deleted > 0) {
			return splice.from + delta + splice.insertLength;
		}
		delta += splice.insertLength - deleted;
	}
	return offset + delta;
}
