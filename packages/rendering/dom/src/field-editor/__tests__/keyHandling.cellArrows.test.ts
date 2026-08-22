import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { afterEach, describe, expect, it } from "vitest";
import { handleFieldEditorKeyDown } from "../keyHandling";

const fixtures: Array<ReturnType<typeof createEditor>> = [];

afterEach(() => {
	while (fixtures.length > 0) {
		fixtures.pop()?.destroy();
	}
});

function createArrowEvent(key: string) {
	let defaultPrevented = false;
	return {
		key,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		altKey: false,
		isComposing: false,
		defaultPrevented,
		preventDefault() {
			defaultPrevented = true;
			Object.defineProperty(this, "defaultPrevented", {
				configurable: true,
				value: true,
			});
		},
	} as KeyboardEvent;
}

describe("handleTableCellKey arrows", () => {
	it("returns false so native cell caret motion is not preventDefaulted", () => {
		const editor = createEditor({ schema: defaultSchema });
		fixtures.push(editor);
		const blockId = editor.firstBlock()!.id;
		const fieldEditor = {
			focusBlockId: blockId,
			inputMode: "table" as const,
			activeCellCoord: { blockId, row: 0, col: 0 },
			activateCell: () => {},
			activateTextSelection: () => {},
			deactivate: () => {},
			selectAll: () => false,
		};

		const event = createArrowEvent("ArrowRight");
		expect(
			handleFieldEditorKeyDown({
				event,
				editor,
				fieldEditor,
				ytext: {
					length: 4,
					toString: () => "cell",
					toDelta: () => [{ insert: "cell" }],
					insert: () => {},
					delete: () => {},
				},
				range: { start: 1, end: 1 },
			}),
		).toBe(false);
		expect(event.defaultPrevented).toBe(false);
	});
});
