import type { ChangeSummary, StructuralChange } from "./types";

export function affectedBlockIdsFromSummary(
	summary: ChangeSummary,
): string[] {
	const ids = new Set<string>();
	for (const text of summary.text) {
		ids.add(text.blockId);
	}
	for (const change of summary.structural) {
		addStructuralBlockIds(ids, change);
	}
	return [...ids];
}

function addStructuralBlockIds(
	ids: Set<string>,
	change: StructuralChange,
): void {
	switch (change.type) {
		case "block-inserted":
		case "block-removed":
		case "block-moved":
		case "block-converted":
		case "block-props-changed":
		case "table-changed":
			ids.add(change.blockId);
			return;
		case "block-split":
			ids.add(change.blockId);
			ids.add(change.newBlockId);
			return;
		case "blocks-merged":
			ids.add(change.targetBlockId);
			ids.add(change.sourceBlockId);
			return;
		case "apps-changed":
		case "metadata-changed":
			return;
		default: {
			const _exhaustive: never = change;
			return _exhaustive;
		}
	}
}
