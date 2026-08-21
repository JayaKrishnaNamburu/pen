import type {
	CommitEvent,
	CommitEventSource,
	CRDTEvent,
	DiagnosticEvent,
	OpOrigin,
	SelectionRecord,
	StructuredOpOrigin,
} from "@input/pen-types";
import { getOpOriginType } from "./origin";

import type { ChangeSummary } from "../changes/types";

export const EVENT_DEPRECATED_CODE = "event-deprecated";

export function toStructuredOrigin(origin: OpOrigin): StructuredOpOrigin {
	return typeof origin === "string" ? { type: origin } : origin;
}

export function resolveCommitSource(
	origin: OpOrigin,
	fallback: CommitEventSource,
): CommitEventSource {
	if (typeof origin !== "string") {
		if (origin.source === "stream") {
			return "stream";
		}
		if (origin.type === "history") {
			return origin.source === "redo" ? "redo" : "undo";
		}
	}
	const type = getOpOriginType(origin);
	if (type === "history") {
		return "undo";
	}
	if (type === "collaborator") {
		return "remote";
	}
	return fallback;
}

export function snapshotSelectionRecord(
	record: SelectionRecord,
): SelectionRecord {
	return {
		state: cloneRecordState(record.state),
		version: record.version,
		origin: record.origin,
		commitId: record.commitId,
	};
}

function cloneRecordState(
	state: SelectionRecord["state"],
): SelectionRecord["state"] {
	if (state === null) {
		return null;
	}
	switch (state.type) {
		case "text":
			return {
				type: "text",
				anchor: { ...state.anchor },
				focus: { ...state.focus },
				affinity: state.affinity,
				goalX: state.goalX,
			};
		case "block":
			return {
				type: "block",
				blockIds: [...state.blockIds],
				head: state.head,
			};
		case "app":
			return { type: "app", appId: state.appId };
		case "cell":
			return {
				type: "cell",
				blockId: state.blockId,
				anchor: { ...state.anchor },
				head: { ...state.head },
			};
		default: {
			const _exhaustive: never = state;
			return _exhaustive;
		}
	}
}

export function buildCommitEvent(input: {
	commitId: number;
	origin: OpOrigin;
	summary: ChangeSummary;
	selectionBefore: SelectionRecord;
	selectionAfter: SelectionRecord;
	source: CommitEventSource;
	diagnostics: readonly DiagnosticEvent[];
}): CommitEvent {
	return {
		commitId: input.commitId,
		origin: toStructuredOrigin(input.origin),
		summary: input.summary,
		selectionBefore: input.selectionBefore,
		selectionAfter: input.selectionAfter,
		source: input.source,
		diagnostics: input.diagnostics,
	};
}

export function createEventDeprecatedDiagnostic(
	key: "change" | "documentCommit",
): DiagnosticEvent {
	return {
		code: EVENT_DEPRECATED_CODE,
		level: "warn",
		source: "pipeline",
		message: `on("${key}") is deprecated; use editor.on("commit")`,
		remediation:
			"Subscribe to commit events and read event.summary / event.origin.",
		key,
	};
}

export function adapterChangeEvent(event: CRDTEvent): CRDTEvent {
	return {
		origin: event.origin,
		affectedBlocks: event.affectedBlocks,
		ops: event.ops,
		timestamp: event.timestamp,
		...(event.scope ? { scope: event.scope } : {}),
	};
}
