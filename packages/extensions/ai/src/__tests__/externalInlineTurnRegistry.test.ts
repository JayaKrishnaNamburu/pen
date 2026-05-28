import { describe, expect, it } from "vitest";
import {
	ExternalInlineTurnRegistry,
	canRegisterExternalInlineTurn,
} from "../runtime/externalInlineTurnRegistry";
import type { AIInlineHistorySnapshot } from "../types";

describe("ExternalInlineTurnRegistry", () => {
	it("resolves undo transition by snapshot ids", () => {
		const registry = new ExternalInlineTurnRegistry();
		registry.set("history-1", {
			sessionId: "session-1",
			turnId: "turn-1",
			historyId: "history-1",
			operations: [],
			suggestionIds: ["s-1"],
			beforeSnapshotId: "before",
			afterSnapshotId: "after",
		});

		const current = snapshotWithId("after");
		const target = snapshotWithId("before");
		const result = registry.resolveTransition(
			current,
			target,
			"undo",
			() => false,
		);

		expect(result?.historyId).toBe("history-1");
	});

	it("blocks duplicate registration", () => {
		const registry = new ExternalInlineTurnRegistry();
		registry.set("history-1", {
			sessionId: "session-1",
			turnId: "turn-1",
			historyId: "history-1",
			operations: [{ type: "insert-text", blockId: "b", offset: 0, text: "x" }],
			suggestionIds: ["s-1"],
		});

		expect(
			canRegisterExternalInlineTurn(
				{
					sessionId: "session-1",
					turnId: "turn-1",
					historyId: "history-1",
					operations: [],
					suggestionIds: ["s-2"],
				},
				registry,
			),
		).toBe(false);
	});
});

function snapshotWithId(id: string): AIInlineHistorySnapshot {
	return {
		id,
		sessionId: null,
		documentVersion: 1,
		activeSessionId: null,
		sessions: [],
		kind: "document-coupled",
	};
}
