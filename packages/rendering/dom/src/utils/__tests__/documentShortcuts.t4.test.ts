import { createEditor, getCommandRegistry } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { afterEach, describe, expect, it } from "vitest";
import { handleEditorDocumentKeyDown } from "../documentShortcuts";

const fixtures: Array<ReturnType<typeof createEditor>> = [];

afterEach(() => {
	while (fixtures.length > 0) {
		fixtures.pop()?.destroy();
	}
});

function createKeyEvent(
	key: string,
	options: Partial<KeyboardEvent> = {},
): KeyboardEvent {
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
		...options,
	} as KeyboardEvent;
}

function spyRegistryDispatch(
	registry: NonNullable<ReturnType<typeof getCommandRegistry>>,
): string[] {
	const dispatched: string[] = [];
	const originalDispatch = registry.dispatch.bind(registry);
	registry.dispatch = ((command, param, context) => {
		dispatched.push(command.name);
		return originalDispatch(command, param, context);
	}) as typeof registry.dispatch;
	return dispatched;
}

function createFieldEditor() {
	const activations: Array<{
		blockId: string;
		anchorOffset: number;
		focusOffset: number;
	}> = [];
	let deactivated = 0;
	return {
		controller: {
			isComposing: false,
			isEditing: false,
			focusBlockId: null,
			activateTextSelection: (
				blockId: string,
				anchorOffset: number,
				focusOffset: number,
			) => {
				activations.push({ blockId, anchorOffset, focusOffset });
			},
			deactivate: () => {
				deactivated += 1;
			},
		},
		activations,
		get deactivated() {
			return deactivated;
		},
	};
}

function createTwoParagraphEditor() {
	const editor = createEditor({ schema: defaultSchema });
	fixtures.push(editor);
	const firstId = editor.firstBlock()!.id;
	const secondId = "two-p2";
	editor.apply([
		{
			type: "splice-text",
			blockId: firstId,
			from: 0,
				to: 0,
				insert: "Alpha bravo charlie",
		},
		{
			type: "insert-block",
			blockId: secondId,
			blockType: "paragraph",
			props: {},
			position: { after: firstId },
		},
		{
			type: "splice-text",
			blockId: secondId,
			from: 0,
				to: 0,
				insert: "Delta echo foxtrot",
		},
	]);
	return { editor, firstId, secondId };
}

describe("T4 document-level block-selection arrows", () => {
	it("T4: ArrowDown from a multi-block BlockSelection dispatches pen.caretDown and collapses to the end of head", () => {
		const { editor, firstId, secondId } = createTwoParagraphEditor();
		const registry = getCommandRegistry(editor);
		if (!registry) {
			throw new Error("expected command registry");
		}
		const dispatched = spyRegistryDispatch(registry);
		editor.selectBlocks([firstId, secondId]);
		const fieldEditor = createFieldEditor();
		const root = { ownerDocument: null } as unknown as HTMLElement;

		const handled = handleEditorDocumentKeyDown({
			event: createKeyEvent("ArrowDown"),
			editor,
			fieldEditor: fieldEditor.controller as never,
			root,
		});

		expect(handled).toBe(true);
		expect(dispatched).toContain("pen.caretDown");
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: secondId, offset: "Delta echo foxtrot".length },
			focus: { blockId: secondId, offset: "Delta echo foxtrot".length },
		});
		expect(fieldEditor.activations).toEqual([
			{
				blockId: secondId,
				anchorOffset: "Delta echo foxtrot".length,
				focusOffset: "Delta echo foxtrot".length,
			},
		]);
	});

	it("T4: Shift+ArrowUp from a multi-block BlockSelection dispatches pen.caretUp and shrinks blockIds at head", () => {
		const { editor, firstId, secondId } = createTwoParagraphEditor();
		const registry = getCommandRegistry(editor);
		if (!registry) {
			throw new Error("expected command registry");
		}
		const dispatched = spyRegistryDispatch(registry);
		editor.selectBlocks([firstId, secondId]);
		const fieldEditor = createFieldEditor();
		const root = { ownerDocument: null } as unknown as HTMLElement;

		const handled = handleEditorDocumentKeyDown({
			event: createKeyEvent("ArrowUp", { shiftKey: true }),
			editor,
			fieldEditor: fieldEditor.controller as never,
			root,
		});

		expect(handled).toBe(true);
		expect(dispatched).toContain("pen.caretUp");
		expect(editor.selection).toMatchObject({
			type: "block",
			blockIds: [firstId],
			head: firstId,
		});
		expect(fieldEditor.deactivated).toBeGreaterThan(0);
	});

	it("does not dispatch pen.caretDown for a text caret", () => {
		const { editor, firstId } = createTwoParagraphEditor();
		const registry = getCommandRegistry(editor);
		if (!registry) {
			throw new Error("expected command registry");
		}
		const dispatched = spyRegistryDispatch(registry);
		editor.selectText(firstId, 0, 0);
		const fieldEditor = createFieldEditor();
		const root = { ownerDocument: null } as unknown as HTMLElement;

		const handled = handleEditorDocumentKeyDown({
			event: createKeyEvent("ArrowDown"),
			editor,
			fieldEditor: fieldEditor.controller as never,
			root,
		});

		expect(handled).toBe(false);
		expect(dispatched).not.toContain("pen.caretDown");
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: firstId, offset: 0 },
			focus: { blockId: firstId, offset: 0 },
		});
	});
});
