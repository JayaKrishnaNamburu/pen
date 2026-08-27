import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeSelectionFormation } from "../selectionFormation";

const fixtures: Array<ReturnType<typeof createEditor>> = [];

afterEach(() => {
	while (fixtures.length > 0) {
		fixtures.pop()?.destroy();
	}
});

function createMixedBoundaryEditor() {
	const editor = createEditor({ schema: defaultSchema });
	fixtures.push(editor);
	const p1 = editor.firstBlock()!.id;
	editor.apply([
		{
			type: "insert-block",
			blockId: "d1",
			blockType: "divider",
			props: {},
			position: { after: p1 },
		},
	]);
	return { editor, p1 };
}

describe("normalizeSelectionFormation T2/N2", () => {
	it("does not escalate a mixed text/structural range to BlockSelection", () => {
		const { editor, p1 } = createMixedBoundaryEditor();
		const formed = normalizeSelectionFormation(editor, {
			anchor: { blockId: p1, offset: 2 },
			focus: { blockId: "d1", offset: 1 },
		});
		expect(formed).toEqual({
			type: "text",
			anchor: { blockId: p1, offset: 2 },
			focus: { blockId: "d1", offset: 1 },
		});
	});

	it("N2: expands an uncovering structural end to a full 0..1 cover", () => {
		const { editor, p1 } = createMixedBoundaryEditor();
		const formed = normalizeSelectionFormation(editor, {
			anchor: { blockId: p1, offset: 2 },
			focus: { blockId: "d1", offset: 0 },
		});
		expect(formed).toEqual({
			type: "text",
			anchor: { blockId: p1, offset: 2 },
			focus: { blockId: "d1", offset: 1 },
		});
	});
});
