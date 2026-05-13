// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { createEditor } from "@pen/core";
import { defaultPreset } from "@pen/preset-default";
import { DATA_ATTRS } from "../utils/dataAttributes";
import {
	domPointToOffset,
	domSelectionToEditor,
	editorSelectionToDOM,
} from "../field-editor/selectionBridge";
import { Pen } from "../primitives/index";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function flushAnimationFrames(count = 1): Promise<void> {
	for (let i = 0; i < count; i++) {
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => resolve());
		});
	}
}

function createPresetEditor() {
	return createEditor({
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

function seedInlineAtomDocument(editor: ReturnType<typeof createPresetEditor>) {
	const blockId = editor.firstBlock()!.id;
	editor.apply([
		{ type: "insert-text", blockId, offset: 0, text: "A" },
		{
			type: "insert-inline-node",
			blockId,
			offset: 1,
			nodeType: "mention",
			props: { id: "user-1", label: "Ada" },
		},
		{ type: "insert-text", blockId, offset: 2, text: "B" },
	]);
	return blockId;
}

describe("Pen inline atom editing", () => {
	it("renders inline nodes as logical atom elements", async () => {
		const editor = createPresetEditor();
		seedInlineAtomDocument(editor);
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		try {
			await act(async () => {
				root.render(
					<Pen.Editor.Root editor={editor}>
						<Pen.Editor.Content />
					</Pen.Editor.Root>,
				);
				await flushAnimationFrames(2);
			});

			const atom = container.querySelector(
				`[${DATA_ATTRS.inlineAtom}]`,
			) as HTMLElement | null;

			expect(atom).not.toBeNull();
			expect(atom?.getAttribute(DATA_ATTRS.inlineAtomType)).toBe(
				"mention",
			);
			expect(atom?.textContent).toBe("@Ada");
		} finally {
			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		}
	});

	it("round-trips DOM selection offsets around inline atoms", async () => {
		const editor = createPresetEditor();
		const blockId = seedInlineAtomDocument(editor);
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		try {
			await act(async () => {
				root.render(
					<Pen.Editor.Root editor={editor}>
						<Pen.Editor.Content />
					</Pen.Editor.Root>,
				);
				await flushAnimationFrames(2);
			});

			const rootElement = container.querySelector(
				`[${DATA_ATTRS.editorRoot}]`,
			) as HTMLElement | null;
			const inlineElement = container.querySelector(
				`[${DATA_ATTRS.inlineContent}]`,
			) as HTMLElement | null;
			expect(rootElement).not.toBeNull();
			expect(inlineElement).not.toBeNull();
			expect(domPointToOffset(inlineElement!, inlineElement!, 1)).toBe(1);
			expect(domPointToOffset(inlineElement!, inlineElement!, 2)).toBe(2);

			editorSelectionToDOM(
				rootElement!,
				{ blockId, offset: 2 },
				{ blockId, offset: 2 },
			);

			expect(domSelectionToEditor(rootElement!)).toEqual({
				anchor: { blockId, offset: 2 },
				focus: { blockId, offset: 2 },
			});
		} finally {
			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		}
	});
});
