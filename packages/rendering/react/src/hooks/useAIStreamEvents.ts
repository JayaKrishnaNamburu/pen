import { useSyncExternalStore } from "react";
import { aiControllerFacet } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import type { AIController, AIStreamEvent } from "@input/pen-ai";

const EMPTY_STREAM_EVENTS: readonly AIStreamEvent[] = Object.freeze([]);

export function useAIStreamEvents(editor: Editor): readonly AIStreamEvent[] {
	const controller =
		(editor.facet(aiControllerFacet) as AIController | null) ?? null;

	return useSyncExternalStore(
		(callback) => {
			if (!controller) {
				return () => {};
			}
			return controller.subscribeStreamEvents(callback);
		},
		() => controller?.getStreamEvents() ?? EMPTY_STREAM_EVENTS,
		() => EMPTY_STREAM_EVENTS,
	);
}
