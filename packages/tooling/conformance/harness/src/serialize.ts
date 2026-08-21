import { isCollapsed } from "@input/pen-core";
import type { DiagnosticEvent, SelectionState } from "@input/pen-types";
import type {
	SerializedDiagnostic,
	SerializedSelection,
} from "../../src/types";

/** Snapshot `isCollapsed` via the official helper — never copy a live field. */
export function serializeSelection(
	selection: SelectionState,
): SerializedSelection {
	if (selection == null) {
		return null;
	}

	switch (selection.type) {
		case "text":
			return {
				type: "text",
				anchor: {
					blockId: selection.anchor.blockId,
					offset: selection.anchor.offset,
				},
				focus: {
					blockId: selection.focus.blockId,
					offset: selection.focus.offset,
				},
				isCollapsed: isCollapsed(selection),
			};
		case "block":
			return {
				type: "block",
				blockIds: [...selection.blockIds],
			};
		case "app":
			return {
				type: "app",
				appId: selection.appId,
			};
		case "cell":
			return {
				type: "cell",
				blockId: selection.blockId,
				anchor: { ...selection.anchor },
				head: { ...selection.head },
			};
		default: {
			const _exhaustive: never = selection;
			return _exhaustive;
		}
	}
}

export function serializeDiagnostic(
	event: DiagnosticEvent,
): SerializedDiagnostic {
	return {
		code: event.code,
		level: event.level,
		source: event.source,
		message: event.message,
		...(typeof event.reason === "string" ? { reason: event.reason } : {}),
	};
}