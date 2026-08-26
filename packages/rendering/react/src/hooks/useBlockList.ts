import type { Editor } from "@input/pen-types";
import { getRootBlockIds } from "../utils/parentIdTree";
import { useSyncExternalStoreWithSelector } from "../utils/useSyncExternalStoreWithSelector";

// HOST5: empty order is correct for shell-only SSR. Do not read the live
// document here — hosts that need HTML content use @input/pen-interop/html
// on their own copy.
const SSR_BLOCK_ORDER: readonly string[] = [];

export function useBlockList(editor: Editor): readonly string[] {
	return useSyncExternalStoreWithSelector(
		(callback) => editor.on("commit", () => callback()),
		() => editor.documentState.blockOrder,
		() => SSR_BLOCK_ORDER,
		(blockOrder) =>
			blockOrder === SSR_BLOCK_ORDER
				? SSR_BLOCK_ORDER
				: getRootBlockIds(editor),
		areBlockListsEqual,
	);
}

function areBlockListsEqual(
	previous: readonly string[],
	next: readonly string[],
): boolean {
	if (previous.length !== next.length) return false;
	for (let index = 0; index < previous.length; index += 1) {
		if (previous[index] !== next[index]) return false;
	}
	return true;
}
