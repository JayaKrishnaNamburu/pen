import { useMemo, useSyncExternalStore } from "react";
import { snapshotsControllerFacet } from "@input/pen-core";
import type {
	BlameRange,
	CharacterAttribution,
	SnapshotsController,
} from "@input/pen-snapshots";
import type { Editor, Unsubscribe } from "@input/pen-types";
import { useSnapshots } from "./useSnapshots";
import { useMultiplayer } from "./useMultiplayer";

export interface AttributionState {
	attributions: readonly CharacterAttribution[];
	blameRanges: readonly BlameRange[];
}

const EMPTY_ATTRIBUTION_STATE: AttributionState = {
	attributions: [],
	blameRanges: [],
};

export function useAttribution(
	editor: Editor,
	blockId: string,
): AttributionState {
	const historyController =
		(editor.facet(snapshotsControllerFacet) as SnapshotsController | null) ??
		null;
	const historyState = useSnapshots(editor);
	const multiplayerState = useMultiplayer(editor);
	const canReadHistoryAttribution =
		isHistoryAttributionController(historyController);
	const blockRevision = useSyncExternalStore(
		(callback) => editor.on("commit", () => callback()),
		() => editor.getBlockRevision(blockId),
		() => 0,
	);

	return useMemo(() => {
		if (!canReadHistoryAttribution) {
			return EMPTY_ATTRIBUTION_STATE;
		}

		return {
			attributions: historyController.getCharacterAttribution(blockId),
			blameRanges: historyController.getBlameRanges(blockId),
		};
	}, [
		blockId,
		blockRevision,
		canReadHistoryAttribution,
		historyController,
		historyState,
		multiplayerState,
	]);
}

function isHistoryAttributionController(
	controller: SnapshotsController | null,
): controller is SnapshotsController & {
	subscribe(listener: () => void): Unsubscribe;
	getCharacterAttribution(blockId: string): readonly CharacterAttribution[];
	getBlameRanges(blockId: string): readonly BlameRange[];
} {
	return (
		typeof controller?.subscribe === "function" &&
		typeof controller?.getCharacterAttribution === "function" &&
		typeof controller?.getBlameRanges === "function"
	);
}
