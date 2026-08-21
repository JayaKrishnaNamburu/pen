// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { createEditor as createCoreEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { Pen } from "../primitives/index";
import { defaultSchema } from "@input/pen-schema-default";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createEditor(options: Parameters<typeof createCoreEditor>[0] = {}) {
	return createCoreEditor({
		schema: defaultSchema,
		...options,
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

async function cleanupEditor(
	editor: ReturnType<typeof createEditor>,
	root: Root,
	container: HTMLElement,
): Promise<void> {
	await act(async () => {
		root.unmount();
	});
	container.remove();
	editor.destroy();
}

async function renderEditor(editor: ReturnType<typeof createEditor>): Promise<{
	container: HTMLElement;
	root: Root;
}> {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<Pen.Editor.Root editor={editor}>
				<Pen.Editor.Content />
			</Pen.Editor.Root>,
		);
	});

	return { container, root };
}

function getBlockHost(container: HTMLElement, blockId: string): HTMLElement {
	const host = container.querySelector(
		`[data-pen-editor-block][data-block-id="${blockId}"]`,
	);
	if (!(host instanceof HTMLElement)) {
		throw new Error(`Missing block content host for ${blockId}`);
	}
	return host;
}

describe("@input/pen-react DIR2 block content host dir", () => {
	it("DIR2: sets dir=ltr from block.props.direction", async () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "update-block",
				blockId,
				props: { direction: "ltr" },
			},
		]);

		const { container, root } = await renderEditor(editor);

		expect(getBlockHost(container, blockId).getAttribute("dir")).toBe(
			"ltr",
		);

		await cleanupEditor(editor, root, container);
	});

	it("DIR2: sets dir=rtl from block.props.direction", async () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "update-block",
				blockId,
				props: { direction: "rtl" },
			},
		]);

		const { container, root } = await renderEditor(editor);

		expect(getBlockHost(container, blockId).getAttribute("dir")).toBe(
			"rtl",
		);

		await cleanupEditor(editor, root, container);
	});

	it("DIR2: omits dir when block.props.direction is missing", async () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;

		const { container, root } = await renderEditor(editor);

		expect(getBlockHost(container, blockId).hasAttribute("dir")).toBe(
			false,
		);

		await cleanupEditor(editor, root, container);
	});

	it("DIR2: omits dir when block.props.direction is auto", async () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "update-block",
				blockId,
				props: { direction: "auto" },
			},
		]);

		const { container, root } = await renderEditor(editor);
		const host = getBlockHost(container, blockId);

		expect(host.hasAttribute("dir")).toBe(false);
		expect(host.getAttribute("dir")).not.toBe("auto");

		await cleanupEditor(editor, root, container);
	});

	it("DIR2: never sets dir=auto after an explicit direction is cleared", async () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "update-block",
				blockId,
				props: { direction: "rtl" },
			},
		]);

		const { container, root } = await renderEditor(editor);
		expect(getBlockHost(container, blockId).getAttribute("dir")).toBe(
			"rtl",
		);

		await act(async () => {
			editor.apply([
				{
					type: "update-block",
					blockId,
					props: { direction: "auto" },
				},
			]);
		});

		const host = getBlockHost(container, blockId);
		expect(host.hasAttribute("dir")).toBe(false);
		expect(host.getAttribute("dir")).not.toBe("auto");

		await cleanupEditor(editor, root, container);
	});

	it("DIR2: sets dir independently on each block host", async () => {
		const editor = createEditor();
		const ltrBlockId = editor.firstBlock()!.id;
		const rtlBlockId = crypto.randomUUID();
		const autoBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "update-block",
				blockId: ltrBlockId,
				props: { direction: "ltr" },
			},
			{
				type: "insert-block",
				blockId: rtlBlockId,
				blockType: "paragraph",
				props: { direction: "rtl" },
				position: { after: ltrBlockId },
			},
			{
				type: "insert-block",
				blockId: autoBlockId,
				blockType: "paragraph",
				props: { direction: "auto" },
				position: { after: rtlBlockId },
			},
		]);

		const { container, root } = await renderEditor(editor);

		expect(getBlockHost(container, ltrBlockId).getAttribute("dir")).toBe(
			"ltr",
		);
		expect(getBlockHost(container, rtlBlockId).getAttribute("dir")).toBe(
			"rtl",
		);
		expect(getBlockHost(container, autoBlockId).hasAttribute("dir")).toBe(
			false,
		);

		await cleanupEditor(editor, root, container);
	});
});
