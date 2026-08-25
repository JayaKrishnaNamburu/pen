import { aiControllerFacet } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import type { AIController, AISession } from "@input/pen-ai";
import { useSyncExternalStoreWithSelector } from "../utils/useSyncExternalStoreWithSelector";

const EMPTY_AI_SESSIONS: readonly AISession[] = [];

export function useAISessions(editor: Editor): readonly AISession[] {
	const controller =
		(editor.facet(aiControllerFacet) as AIController | null) ?? null;

	return useSyncExternalStoreWithSelector(
		(callback) => {
			if (!controller) {
				return () => {};
			}
			return controller.subscribeSessions(callback);
		},
		() => controller?.getSessions() ?? EMPTY_AI_SESSIONS,
		() => EMPTY_AI_SESSIONS,
		(sessions) => sessions,
		areSessionsEqual,
	);
}

function areSessionsEqual(
	previous: readonly AISession[],
	next: readonly AISession[],
): boolean {
	if (previous.length !== next.length) {
		return false;
	}
	for (let index = 0; index < previous.length; index += 1) {
		if (previous[index] !== next[index]) {
			return false;
		}
	}
	return true;
}
