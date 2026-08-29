// @vitest-environment jsdom

import {
	defineBlock,
	mergeSchemas,
	prop,
	SchemaRegistryImpl,
	shouldRenderContainerChildren,
} from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import type { Editor } from "@input/pen-types";
import { createTestEditor } from "@input/pen-test";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { h } from "vue";
import { PenEditor } from "../components/PenEditor";
import type { PenBlockRenderer } from "../types";

afterEach(() => {
	document.body.replaceChildren();
});

/**
 * A host-defined container, deliberately not `toggle`, `callout`, or
 * `blockquote`: container behavior has to follow from `isContainer` in the
 * schema, not from a type list inside the renderer.
 */
const emailQuote = defineBlock("emailQuote", {
	content: "inline",
	isContainer: true,
	props: {
		open: prop.boolean().default(true),
		parentId: prop.string().optional(),
	},
});

const schema = mergeSchemas(
	defaultSchema,
	new SchemaRegistryImpl({
		blocks: [emailQuote],
		inlines: [],
	}),
);

function createQuoteEditor() {
	return createTestEditor({
		schema,
		blocks: [{ id: "quote-1", type: "emailQuote", props: {} }],
	});
}

/**
 * The Vue children outlet is `ctx.childNodes`, which `PenBlock` passes to every
 * renderer. Collapsing stays the renderer's decision, through the same shared
 * predicate the DOM navigation uses.
 */
function quoteRenderer(editor: Editor): PenBlockRenderer {
	return (block, ctx) =>
		h("div", { "data-quote": block.id }, [
			shouldRenderContainerChildren(editor, editor.getBlock(block.id))
				? h("div", { "data-quote-children": "" }, ctx.childNodes)
				: null,
		]);
}

describe("host-defined container rendering", () => {
	it("passes children written to the children array into a host renderer", async () => {
		const editor = createQuoteEditor();

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: "quoted-line",
					blockType: "paragraph",
					props: {},
					position: { parent: "quote-1", index: 0 },
				},
				{
					type: "splice-text",
					blockId: "quoted-line",
					from: 0,
					to: 0,
					insert: "quoted line",
				},
			],
			{ origin: "user" },
		);

		const wrapper = mount(PenEditor, {
			attachTo: document.body,
			props: {
				editor,
				renderers: { emailQuote: quoteRenderer(editor) },
			},
		});

		const children = wrapper.find("[data-quote-children]");
		expect(children.exists()).toBe(true);
		expect(children.text()).toContain("quoted line");

		wrapper.unmount();
		editor.destroy();
	});

	it("passes children written through the parentId prop into a host renderer", async () => {
		const editor = createQuoteEditor();

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: "sibling-child",
					blockType: "paragraph",
					props: { parentId: "quote-1" },
					position: { after: "quote-1" },
				},
				{
					type: "splice-text",
					blockId: "sibling-child",
					from: 0,
					to: 0,
					insert: "sibling child",
				},
			],
			{ origin: "user" },
		);

		const wrapper = mount(PenEditor, {
			attachTo: document.body,
			props: {
				editor,
				renderers: { emailQuote: quoteRenderer(editor) },
			},
		});

		const children = wrapper.find("[data-quote-children]");
		expect(children.exists()).toBe(true);
		expect(children.text()).toContain("sibling child");

		wrapper.unmount();
		editor.destroy();
	});
});
