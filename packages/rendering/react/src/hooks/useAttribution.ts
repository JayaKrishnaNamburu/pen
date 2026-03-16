import { useMemo, useSyncExternalStore } from "react";
import type {
	BlameRange,
	CharacterAttribution,
	HistoryController,
} from "@pen/history";
import { getHistoryController } from "@pen/history";
import type { Editor, Unsubscribe } from "@pen/types";
import { useHistory } from "./useHistory";
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
	const historyController = getHistoryController(editor);
	const historyState = useHistory(editor);
	const multiplayerState = useMultiplayer(editor);
	const canReadHistoryAttribution =
		isHistoryAttributionController(historyController);
	const blockRevision = useSyncExternalStore(
		(callback) => editor.onDocumentCommit(callback),
		() => editor.getBlockRevision(blockId),
		() => 0,
	);

	return useMemo(
		() => {
			if (!canReadHistoryAttribution) {
				return EMPTY_ATTRIBUTION_STATE;
			}

			return {
				attributions: historyController.getCharacterAttribution(blockId),
				blameRanges: historyController.getBlameRanges(blockId),
			};
		},
		[
			blockId,
			blockRevision,
			canReadHistoryAttribution,
			historyController,
			historyState,
			multiplayerState,
		],
	);
}

function isHistoryAttributionController(
	controller: HistoryController | null,
): controller is HistoryController & {
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
