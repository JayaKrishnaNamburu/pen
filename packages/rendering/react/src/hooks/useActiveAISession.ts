import { aiControllerFacet } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import type { AIController, AISession } from "@input/pen-ai";
import { useSyncExternalStoreWithSelector } from "../utils/useSyncExternalStoreWithSelector";

export function useActiveAISession(editor: Editor): AISession | null {
	const controller =
		(editor.facet(aiControllerFacet) as AIController | null) ?? null;

	return useSyncExternalStoreWithSelector(
		(callback) => {
			if (!controller) {
				return () => {};
			}
			return controller.subscribeSessions(callback);
		},
		() => controller?.getState() ?? null,
		() => null,
		(state) =>
			state?.sessions.find(
				(session) => session.id === state.activeSessionId,
			) ?? null,
	);
}
