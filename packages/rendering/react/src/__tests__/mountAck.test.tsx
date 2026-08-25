// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { createEditor, fieldEditorHostFacet } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import type { FieldEditorImpl } from "@input/pen-dom/field-editor/fieldEditorImpl";
import { defaultSchema } from "@input/pen-schema-default";
import { DATA_ATTRS } from "@input/pen-dom/utils/dataAttributes";
import { Pen } from "../primitives/index";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function getFieldEditor(
	editor: ReturnType<typeof createEditor>,
): FieldEditorImpl {
	const fieldEditor = editor.facet(
		fieldEditorHostFacet,
	) as FieldEditorImpl | null;
	if (!fieldEditor) {
		throw new Error("Missing attached field editor");
	}
	return fieldEditor;
}

describe("@input/pen-react mount ack", () => {
	it("acks mounted blocks from Content in the layout-effect phase", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			preset: defaultPreset({
				documentOps: false,
				deltaStream: false,
				undo: false,
			}),
		});
		const blockId = editor.firstBlock()!.id;
		const acks: string[] = [];
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
			});

			const fieldEditor = getFieldEditor(editor);
			const original = fieldEditor.ackBlockMounted.bind(fieldEditor);
			fieldEditor.ackBlockMounted = (id, element) => {
				acks.push(id);
				original(id, element);
			};

			await act(async () => {
				editor.apply([
					{
						type: "splice-text",
						blockId,
						from: 0,
				to: 0,
				insert: "Hi",
					},
				]);
			});

			expect(acks).toContain(blockId);
			expect(
				container.querySelector(`[${DATA_ATTRS.editorBlock}]`),
			).not.toBeNull();
		} finally {
			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		}
	});
});
