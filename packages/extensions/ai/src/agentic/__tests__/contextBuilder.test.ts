import { defaultSchema } from "@pen/schema-default";
import type { ApplyOptions, DocumentOp, Editor } from "@pen/types";
import { describe, expect, it, vi } from "vitest";
import { buildToolContext } from "../contextBuilder";

function createStructuredEditor(): Editor {
	const blocks = [
		{
			id: "subdocument-1",
			type: "subdocument",
			props: {},
			children: [],
			textContent: () => "",
			textDeltas: () => [],
		},
	];

	return {
		documentProfile: "structured",
		schema: defaultSchema,
		apply: vi.fn<(ops: DocumentOp[], options?: ApplyOptions) => void>(),
		getBlock: (blockId: string) => blocks.find((block) => block.id === blockId) ?? null,
		internals: {
			getSlot: () => undefined,
		},
		undoManager: {
			stopCapturing: vi.fn(),
		},
	} as unknown as Editor;
}

describe("buildToolContext", () => {
	it("reuses the guarded document-ops mutation policy", () => {
		const editor = createStructuredEditor();
		const context = buildToolContext(editor, "zone-1", "subdocument-1", null);

		expect(() =>
			context.updateBlock("subdocument-1", { title: "Forbidden" }),
		).toThrow(
			'Block "subdocument-1" of type "subdocument" is not editable in structured documents.',
		);
		expect(editor.apply).not.toHaveBeenCalled();
	});
});
