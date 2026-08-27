// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
	blockDirectionFacet,
	createEditor,
	defaultDirectionFacet,
	defineExtension,
	resolveBlockDirection,
} from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import type { Editor } from "@input/pen-types";
import { mountEditor } from "../host/mountEditor";
import { DATA_ATTRS } from "../utils/dataAttributes";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createBareEditor(
	options: Parameters<typeof createEditor>[0] = {},
): Editor {
	return createEditor({
		schema: defaultSchema,
		preset: noDefaultExtensionsPreset,
		...options,
	});
}

function setBlockText(
	editor: Editor,
	blockId: string,
	text: string,
	direction?: "ltr" | "rtl" | "auto",
) {
	editor.apply([
		{
			type: "splice-text",
			blockId,
			from: 0,
			to: 0,
			insert: text,
		},
		...(direction
			? [
					{
						type: "set-props" as const,
						blockId,
						props: { direction },
					},
				]
			: []),
	]);
}

function getBlockHost(root: HTMLElement, blockId: string): HTMLElement {
	const host = root.querySelector(
		`[${DATA_ATTRS.editorBlock}][${DATA_ATTRS.blockId}="${blockId}"]`,
	);
	if (!(host instanceof HTMLElement)) {
		throw new Error(`Missing block content host for ${blockId}`);
	}
	return host;
}

describe("DOM host DIR1 resolved host dir", () => {
	const cleanups: Array<() => void> = [];

	afterEach(() => {
		for (const cleanup of cleanups.splice(0)) {
			cleanup();
		}
		document.body.replaceChildren();
	});

	function mount(editor: Editor): HTMLElement {
		const root = document.createElement("div");
		document.body.append(root);
		const mounted = mountEditor(editor, root);
		cleanups.push(() => {
			mounted.destroy();
			editor.destroy();
		});
		return root;
	}

	it("DIR1: LTR text with no facet and no prop omits dir", () => {
		const editor = createBareEditor();
		const blockId = editor.firstBlock()!.id;
		setBlockText(editor, blockId, "Hello");
		const root = mount(editor);
		const block = editor.getBlock(blockId)!;

		expect(resolveBlockDirection(editor, block)).toBe("ltr");
		expect(getBlockHost(root, blockId).hasAttribute("dir")).toBe(false);
		expect(root.innerHTML).not.toContain('dir="auto"');
	});

	it("DIR1: pen.blockDirection resolver changes rendered dir", () => {
		const editor = createBareEditor({
			extensions: [
				defineExtension({
					name: "dir-facet",
					facets: [blockDirectionFacet.of(() => "rtl")],
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		setBlockText(editor, blockId, "Hello");
		const root = mount(editor);
		const block = editor.getBlock(blockId)!;

		expect(resolveBlockDirection(editor, block)).toBe("rtl");
		expect(getBlockHost(root, blockId).getAttribute("dir")).toBe("rtl");
	});

	it("DIR1: explicit props.direction wins over pen.blockDirection", () => {
		const editor = createBareEditor({
			extensions: [
				defineExtension({
					name: "dir-facet",
					facets: [blockDirectionFacet.of(() => "rtl")],
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		setBlockText(editor, blockId, "Hello", "ltr");
		const root = mount(editor);
		const block = editor.getBlock(blockId)!;

		expect(resolveBlockDirection(editor, block)).toBe("ltr");
		expect(getBlockHost(root, blockId).getAttribute("dir")).toBe("ltr");
	});

	it("DIR1: first-strong RTL text with no prop and no resolver renders RTL", () => {
		const editor = createBareEditor();
		const blockId = editor.firstBlock()!.id;
		setBlockText(editor, blockId, "مرحبا");
		const root = mount(editor);
		const block = editor.getBlock(blockId)!;

		expect(resolveBlockDirection(editor, block)).toBe("rtl");
		expect(getBlockHost(root, blockId).getAttribute("dir")).toBe("rtl");
	});

	it("DIR1: pen.defaultDirection applies when nothing else does", () => {
		const editor = createBareEditor({
			extensions: [
				defineExtension({
					name: "dir-default",
					facets: [defaultDirectionFacet.of("rtl")],
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		setBlockText(editor, blockId, "12345");
		const root = mount(editor);
		const block = editor.getBlock(blockId)!;

		expect(resolveBlockDirection(editor, block)).toBe("rtl");
		expect(getBlockHost(root, blockId).getAttribute("dir")).toBe("rtl");
	});

	it("RI1: block and inline content hosts are unicode-bidi isolate", () => {
		const editor = createBareEditor();
		const blockId = editor.firstBlock()!.id;
		setBlockText(editor, blockId, "مرحبا");
		const root = mount(editor);
		const host = getBlockHost(root, blockId);
		const inline = host.querySelector(`[${DATA_ATTRS.inlineContent}]`);

		expect(host.style.unicodeBidi).toBe("isolate");
		if (!(inline instanceof HTMLElement)) {
			throw new Error(`Missing inline content host for ${blockId}`);
		}
		expect(inline.style.unicodeBidi).toBe("isolate");
	});

	it("DIR1: host dir tracks cache invalidation when block text changes", () => {
		const editor = createBareEditor();
		const blockId = editor.firstBlock()!.id;
		setBlockText(editor, blockId, "مرحبا");
		const root = mount(editor);
		expect(getBlockHost(root, blockId).getAttribute("dir")).toBe("rtl");

		editor.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0 + editor.getBlock(blockId)!.length(),
				insert: "Hello",
			},
		]);

		expect(resolveBlockDirection(editor, editor.getBlock(blockId)!)).toBe(
			"ltr",
		);
		expect(getBlockHost(root, blockId).hasAttribute("dir")).toBe(false);
	});
});
