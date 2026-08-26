import { createEditor, getCommandRegistry } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { afterEach, describe, expect, it } from "vitest";
import { handleFieldEditorKeyDown } from "../keyHandling";

const fixtures: Array<ReturnType<typeof createEditor>> = [];

afterEach(() => {
	while (fixtures.length > 0) {
		fixtures.pop()?.destroy();
	}
});

function createArrowEvent(key: string, shiftKey = false) {
	let defaultPrevented = false;
	return {
		key,
		ctrlKey: false,
		metaKey: false,
		shiftKey,
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

function insertTable(editor: ReturnType<typeof createEditor>, blockId: string) {
	editor.apply(
		[
			{
				type: "insert-block",
				blockId,
				blockType: "table",
				props: {},
				position: "last",
			},
		],
		{ origin: "user" },
	);
}

describe("handleTableCellKey arrows", () => {
	it("T6: ArrowRight in an edited cell dispatches pen.caretRight and preventDefaults", () => {
		const editor = createEditor({ schema: defaultSchema });
		fixtures.push(editor);
		insertTable(editor, "t");
		editor.selectCell("t", 0, 0);

		const registry = getCommandRegistry(editor);
		if (!registry) {
			throw new Error("expected command registry");
		}
		const dispatched: string[] = [];
		const originalDispatch = registry.dispatch.bind(registry);
		registry.dispatch = ((command, param, context) => {
			dispatched.push(command.name);
			return originalDispatch(command, param, context);
		}) as typeof registry.dispatch;

		const written: Array<{ start: number; end: number }> = [];
		const fieldEditor = {
			focusBlockId: "t",
			inputMode: "table" as const,
			activeCellCoord: { blockId: "t", row: 0, col: 0 },
			activateCell: () => {},
			activateTextSelection: () => {},
			commitCellTextSelection: (
				_blockId: string,
				_row: number,
				_col: number,
				start: number,
				end: number,
			) => {
				written.push({ start, end });
			},
			deactivate: () => {},
			selectAllBehavior: "block-first" as const,
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
		).toBe(true);
		expect(event.defaultPrevented).toBe(true);
		expect(dispatched).toContain("pen.caretRight");
		expect(written.length).toBe(1);
	});
});
