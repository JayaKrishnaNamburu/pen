import { describe, expect, it } from "vitest";
import type { A11yMessageKey } from "../types/a11yMessages";
import { PEN_STREAM_PROTOCOL_VERSION } from "../types/stream";

const A11Y_MESSAGE_KEYS = [
	"blockConverted",
	"undoApplied",
	"redoApplied",
	"blockSelectionEntered",
	"blockSelectionChanged",
	"cellSelectionChanged",
	"suggestionAppeared",
	"suggestionAccepted",
	"suggestionRejected",
	"streamingStarted",
	"streamingFinished",
	"findMatches",
	"atomSelected",
	"collaboratorJoined",
	"collaboratorEditing",
] as const satisfies readonly A11yMessageKey[];

describe("v2 type contracts", () => {
	it("locks all fifteen A11yMessageKey names", () => {
		expect(A11Y_MESSAGE_KEYS).toHaveLength(15);
		expect(new Set(A11Y_MESSAGE_KEYS).size).toBe(15);
	});

	it("exports PEN_STREAM_PROTOCOL_VERSION as 1", () => {
		expect(PEN_STREAM_PROTOCOL_VERSION).toBe(1);
	});
});
