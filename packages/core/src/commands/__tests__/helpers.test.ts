import { describe, expect, it } from "vitest";

import { getSelectionBlockRange } from "../../selection/helpers";
import { textSelectionResult } from "../helpers";
import { createCommandEditor } from "./fixture";

describe("textSelectionResult", () => {
	it("stamps blockRange as the document span, not [anchor.blockId]", () => {
		const editor = createCommandEditor([
			{ id: "p1", type: "paragraph", text: "aa" },
			{ id: "p2", type: "paragraph", text: "bb" },
			{ id: "p3", type: "paragraph", text: "cc" },
		]);
		const payload = textSelectionResult(
			{ blockId: "p1", offset: 0 },
			{ blockId: "p3", offset: 2 },
			{ blockOrder: editor.documentState.blockOrder },
		);

		expect(payload.blockRange).toEqual(["p1", "p2", "p3"]);
		expect(payload.blockRange).toEqual(
			getSelectionBlockRange(editor.documentState.blockOrder, payload),
		);

		const reversed = textSelectionResult(
			{ blockId: "p3", offset: 2 },
			{ blockId: "p1", offset: 0 },
			{ blockOrder: editor.documentState.blockOrder },
		);
		expect(reversed.blockRange).toEqual(["p1", "p2", "p3"]);

		editor.destroy();
	});
});
