import { describe, expect, it } from "vitest";
import {
	resolveEditContextKeyDownRange,
	resolveEditContextTextUpdateRange,
} from "../editContextSelectionAuthority";

describe("resolveEditContextTextUpdateRange", () => {
	it("inserts at the trusted caret when the live update range is stale", () => {
		const result = resolveEditContextTextUpdateRange({
			blockId: "p1",
			updateRangeStart: 11,
			updateRangeEnd: 11,
			text: "!",
			isLogicallyEmpty: false,
			editorSelectionRange: null,
			editContextSelection: {
				blockId: "p1",
				anchorOffset: 3,
				focusOffset: 3,
			},
			authoritativeTextInputSelection: null,
			editorCaret: 3,
		});

		expect(result.range).toEqual({ start: 3, end: 3 });
		expect(result.selection).toEqual({
			blockId: "p1",
			anchorOffset: 4,
			focusOffset: 4,
		});
	});
});

describe("resolveEditContextKeyDownRange", () => {
	it("prefers the trusted editor range over a stale live caret", () => {
		const result = resolveEditContextKeyDownRange({
			blockId: "p1",
			isTextEditingKey: true,
			liveDomOffsets: {
				anchor: 11,
				focus: 11,
				start: 11,
				end: 11,
			},
			editContextRange: { start: 11, end: 11 },
			editorSelectionRange: { start: 3, end: 3 },
			authoritativeTextInputSelection: null,
			collapsedEditorSelectionRange: null,
			projectedTextSelection: null,
			synchronizedEditContextRange: null,
		});

		expect(result.range).toEqual({ start: 3, end: 3 });
		expect(result.nextSelection).toEqual({
			blockId: "p1",
			anchorOffset: 3,
			focusOffset: 3,
		});
		expect(result.shouldSyncEditContextSelection).toBe(true);
	});
});
