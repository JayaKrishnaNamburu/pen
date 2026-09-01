import { useSyncExternalStore } from "react";
import {
	getSmoothStreamController,
	type SmoothStreamController,
	type SmoothStreamStatus,
} from "@input/pen-ai/stream";
import type { Editor } from "@input/pen-types";

export interface SmoothStreamView extends SmoothStreamStatus {
	readonly controller: SmoothStreamController | null;
}

const IDLE: SmoothStreamView = {
	isRevealing: false,
	hiddenCharCount: 0,
	enabled: false,
	controller: null,
};

const snapshots = new WeakMap<SmoothStreamController, SmoothStreamView>();

/**
 * Live paced-reveal status. Same store shape as `useSearch`: subscribe, then
 * read.
 */
export function useSmoothStream(editor: Editor): SmoothStreamView {
	const controller = getSmoothStreamController(editor);

	return useSyncExternalStore(
		(onStoreChange) => {
			if (!controller) {
				return () => {};
			}
			return controller.subscribe(() => {
				onStoreChange();
			});
		},
		() => (controller ? readView(controller) : IDLE),
		() => IDLE,
	);
}

// CRAP here is the missing coverage input, not branching: an untested playground
// file scores cyclomatic squared. Cognitive is 2.
// fallow-ignore-next-line complexity
function readView(controller: SmoothStreamController): SmoothStreamView {
	const next: SmoothStreamView = {
		isRevealing: controller.isRevealing(),
		hiddenCharCount: controller.hiddenCharCount(),
		enabled: controller.isEnabled(),
		controller,
	};
	// snapshots is keyed by controller, so previous.controller always matches
	const previous = snapshots.get(controller);
	if (
		previous &&
		previous.isRevealing === next.isRevealing &&
		previous.hiddenCharCount === next.hiddenCharCount &&
		previous.enabled === next.enabled
	) {
		return previous;
	}
	snapshots.set(controller, next);
	return next;
}
