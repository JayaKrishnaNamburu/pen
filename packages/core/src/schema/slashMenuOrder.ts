import type { BlockDisplay } from "@input/pen-types";

const FALLBACK_GROUP = "other";

export function slashMenuGroupOf(display: BlockDisplay): string {
	return display.group ?? FALLBACK_GROUP;
}

/**
 * Reorder items so blocks sharing a group sit together, groups keeping the
 * order they first appear in and items their incoming order.
 *
 * A slash menu renders grouped and navigates by index into this same array, so
 * the grouping belongs here rather than at render time: an item's position here
 * is what the menu's `confirm(index)` resolves, and a list that regrouped on
 * its own would hand back the index of a different block.
 *
 * `allBlockDisplays()` returns registration order, which interleaves. The
 * default schema registers the three list blocks between `heading` and
 * `codeBlock`, so `basic` resumes after `lists` has already started.
 */
export function orderSlashMenuItemsByGroup<T extends { display: BlockDisplay }>(
	items: readonly T[],
): T[] {
	const grouped = new Map<string, T[]>();
	for (const item of items) {
		const group = slashMenuGroupOf(item.display);
		const existing = grouped.get(group);
		if (existing) {
			existing.push(item);
		} else {
			grouped.set(group, [item]);
		}
	}
	return [...grouped.values()].flat();
}
