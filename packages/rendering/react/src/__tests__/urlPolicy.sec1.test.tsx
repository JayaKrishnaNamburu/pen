// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { createEditor as createCoreEditor } from "@input/pen-core";
import { urlPolicyExtension, type UrlPolicy } from "@input/pen-dom";
import { defaultPreset } from "@input/pen-preset-default";
import { defaultSchema } from "@input/pen-schema-default";
import { Pen } from "../primitives/index";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const DENIED_HTTPS = "https://blocked.example/page";
const DENIED_IMAGE = "https://blocked.example/img.png";
const ADMITTED_BLOB = "blob:host-admitted";

function denyUrl(denied: string): (defaults: UrlPolicy) => UrlPolicy {
	return (defaults) => ({
		resolve(raw, context) {
			if (raw === denied) {
				return null;
			}
			return defaults.resolve(raw, context);
		},
	});
}

function admitBlob(defaults: UrlPolicy): UrlPolicy {
	return {
		resolve(raw, context) {
			if (raw === ADMITTED_BLOB) {
				return ADMITTED_BLOB;
			}
			return defaults.resolve(raw, context);
		},
	};
}

function createEditor(
	wrap: (defaults: UrlPolicy) => UrlPolicy,
	options: Parameters<typeof createCoreEditor>[0] = {},
) {
	return createCoreEditor({
		schema: defaultSchema,
		...options,
		extensions: [urlPolicyExtension(wrap), ...(options.extensions ?? [])],
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	});
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

describe("SEC1 React host urlPolicy", () => {
	it("SEC1: ImageRenderer omits a default-admitted URL the host wrap denies", async () => {
		const editor = createEditor(denyUrl(DENIED_IMAGE));
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "set-props",
				blockId,
				props: { type: "image", src: DENIED_IMAGE, alt: "denied" },
			},
		]);

		const { container, root } = await renderEditor(editor);
		const image = container.querySelector("img");

		expect(image).not.toBeNull();
		expect(image?.getAttribute("src")).toBeNull();
		expect(image?.getAttribute("data-pen-blocked-url")).toBe("");
		expect(container.innerHTML).not.toContain(DENIED_IMAGE);

		await cleanupEditor(editor, root, container);
	});

	it("SEC1: ImageRenderer admits a blob: URL the host wrap allows", async () => {
		const editor = createEditor(admitBlob);
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "set-props",
				blockId,
				props: { type: "image", src: ADMITTED_BLOB, alt: "admitted" },
			},
		]);

		const { container, root } = await renderEditor(editor);
		const image = container.querySelector("img");

		expect(image).not.toBeNull();
		expect(image?.getAttribute("src")).toBe(ADMITTED_BLOB);
		expect(image?.hasAttribute("data-pen-blocked-url")).toBe(false);

		await cleanupEditor(editor, root, container);
	});

	it("SEC1: idle InlineContent omits a default-admitted link the host wrap denies", async () => {
		const editor = createEditor(denyUrl(DENIED_HTTPS));
		const firstId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-block",
				blockId: "linked",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "linked",
				from: 0,
				to: 0,
				insert: "click",
			},
			{
				type: "format-text",
				blockId: "linked",
				from: 0,
				to: 0 + 5,
				marks: { link: { href: DENIED_HTTPS } },
			},
		]);
		editor.selectText(firstId, 0, 0);

		const { container, root } = await renderEditor(editor);
		const anchor = container.querySelector('[data-block-id="linked"] a');

		expect(anchor).not.toBeNull();
		expect(anchor?.getAttribute("href")).toBeNull();
		expect(anchor?.getAttribute("data-pen-blocked-url")).toBe("");
		expect(container.innerHTML).not.toContain(DENIED_HTTPS);

		await cleanupEditor(editor, root, container);
	});

	it("SEC1: idle InlineContent admits a blob: link the host wrap allows", async () => {
		const editor = createEditor(admitBlob);
		const firstId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-block",
				blockId: "linked",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "linked",
				from: 0,
				to: 0,
				insert: "click",
			},
			{
				type: "format-text",
				blockId: "linked",
				from: 0,
				to: 0 + 5,
				marks: { link: { href: ADMITTED_BLOB } },
			},
		]);
		editor.selectText(firstId, 0, 0);

		const { container, root } = await renderEditor(editor);
		const anchor = container.querySelector('[data-block-id="linked"] a');

		expect(anchor).not.toBeNull();
		expect(anchor?.getAttribute("href")).toBe(ADMITTED_BLOB);
		expect(anchor?.hasAttribute("data-pen-blocked-url")).toBe(false);

		await cleanupEditor(editor, root, container);
	});

	it("SEC1: idle TableCellContent omits a default-admitted link the host wrap denies", async () => {
		const editor = createEditor(denyUrl(DENIED_HTTPS));
		editor.apply([
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "t1",
				cell: { row: 0, col: 0 },
				from: 0,
				to: 0,
				insert: "click",
			},
			{
				type: "format-text",
				blockId: "t1",
				cell: { row: 0, col: 0 },
				from: 0,
				to: 5,
				marks: { link: { href: DENIED_HTTPS } },
			},
		]);

		const { container, root } = await renderEditor(editor);
		const anchor = container.querySelector(
			'[data-pen-table-cell][data-cell-row="0"][data-cell-col="0"] a',
		);

		expect(anchor).not.toBeNull();
		expect(anchor?.getAttribute("href")).toBeNull();
		expect(anchor?.getAttribute("data-pen-blocked-url")).toBe("");
		expect(container.innerHTML).not.toContain(DENIED_HTTPS);

		await cleanupEditor(editor, root, container);
	});

	it("SEC1: idle TableCellContent admits a blob: link the host wrap allows", async () => {
		const editor = createEditor(admitBlob);
		editor.apply([
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "t1",
				cell: { row: 0, col: 0 },
				from: 0,
				to: 0,
				insert: "click",
			},
			{
				type: "format-text",
				blockId: "t1",
				cell: { row: 0, col: 0 },
				from: 0,
				to: 5,
				marks: { link: { href: ADMITTED_BLOB } },
			},
		]);

		const { container, root } = await renderEditor(editor);
		const anchor = container.querySelector(
			'[data-pen-table-cell][data-cell-row="0"][data-cell-col="0"] a',
		);

		expect(anchor).not.toBeNull();
		expect(anchor?.getAttribute("href")).toBe(ADMITTED_BLOB);
		expect(anchor?.hasAttribute("data-pen-blocked-url")).toBe(false);

		await cleanupEditor(editor, root, container);
	});
});
