// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { Pen } from "../primitives/index";
import { defaultSchema } from "@input/pen-schema-default";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createDirEditor() {
	return createEditor({
		schema: defaultSchema,
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

async function renderEditor(editor: ReturnType<typeof createDirEditor>) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);

	await act(async () => {
		root.render(
			createElement(
				Pen.Editor.Root,
				{ editor },
				createElement(Pen.Editor.Content),
			),
		);
	});

	return { container, root };
}

async function cleanup(
	editor: ReturnType<typeof createDirEditor>,
	root: ReturnType<typeof createRoot>,
	container: HTMLElement,
) {
	await act(async () => {
		root.unmount();
	});
	container.remove();
	editor.destroy();
}

describe("@input/pen-react DIR2", () => {
	it("DIR2: sets dir on the block content host from props.direction ltr or rtl", async () => {
		const editor = createDirEditor();
		const ltrId = editor.firstBlock()!.id;
		const rtlId = "paragraph-rtl";

		editor.apply([
			{
				type: "set-props",
				blockId: ltrId,
				props: { direction: "ltr" },
			},
			{
				type: "insert-block",
				blockId: rtlId,
				blockType: "paragraph",
				props: { direction: "rtl" },
				position: { after: ltrId },
			},
		]);

		const { container, root } = await renderEditor(editor);

		expect(
			container
				.querySelector(`[data-block-id="${ltrId}"]`)
				?.getAttribute("dir"),
		).toBe("ltr");
		expect(
			container
				.querySelector(`[data-block-id="${rtlId}"]`)
				?.getAttribute("dir"),
		).toBe("rtl");

		await cleanup(editor, root, container);
	});

	it("DIR2: omits dir when props.direction is missing or auto", async () => {
		const editor = createDirEditor();
		const noneId = editor.firstBlock()!.id;
		const autoId = "paragraph-auto";

		editor.apply([
			{
				type: "insert-block",
				blockId: autoId,
				blockType: "paragraph",
				props: { direction: "auto" },
				position: { after: noneId },
			},
		]);

		const { container, root } = await renderEditor(editor);

		expect(
			container
				.querySelector(`[data-block-id="${noneId}"]`)
				?.hasAttribute("dir"),
		).toBe(false);
		expect(
			container
				.querySelector(`[data-block-id="${autoId}"]`)
				?.hasAttribute("dir"),
		).toBe(false);
		expect(container.innerHTML).not.toContain('dir="auto"');

		await cleanup(editor, root, container);
	});
});
