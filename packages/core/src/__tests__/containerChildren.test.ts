import { describe, expect, it } from "vitest";
import {
	defineBlock,
	isContainerBlockType,
	mergeSchemas,
	prop,
	SchemaRegistryImpl,
	shouldRenderContainerChildren,
} from "@input/pen-core";

import { createEditor as createCoreEditor } from "../index";
import { createDefaultSchema } from "./fixtures/testSchema";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

/**
 * A host-defined container, the shape hosts actually need: children, no
 * `layout` (Normalize Rule 6 deletes a childless block that declares one), and
 * a collapse prop that is not called `toggle`.
 */
const emailQuote = defineBlock("emailQuote", {
	content: "inline",
	isContainer: true,
	props: {
		open: prop.boolean().default(true),
		parentId: prop.string().optional(),
	},
});

/** a container by nested content rather than by the `isContainer` flag */
const section = defineBlock("section", {
	content: [],
	isContainer: true,
});

/**
 * A container collapsed by default, the shape `toggle` has. Normalization
 * strips props equal to their default, so nothing is stored for a fresh one —
 * which is why the collapse predicate has to read resolved props.
 */
const collapsedQuote = defineBlock("collapsedQuote", {
	content: "inline",
	isContainer: true,
	props: {
		open: prop.boolean().default(false),
	},
});

const schema = mergeSchemas(
	createDefaultSchema(),
	new SchemaRegistryImpl({
		blocks: [
			emailQuote,
			section,
			collapsedQuote,
		],
		inlines: [],
	}),
);

function createEditor() {
	return createCoreEditor({ schema, preset: noDefaultExtensionsPreset });
}

describe("container children", () => {
	it("recognises a host-defined container from its schema, not a type list", () => {
		const editor = createEditor();

		expect(isContainerBlockType(editor, "emailQuote")).toBe(true);
		expect(isContainerBlockType(editor, "section")).toBe(true);
		expect(isContainerBlockType(editor, "paragraph")).toBe(false);
		expect(isContainerBlockType(editor, "nonexistent")).toBe(false);
		expect(isContainerBlockType(editor, null)).toBe(false);
	});

	it("reads children written through the children array", () => {
		const editor = createEditor();
		const quoteId = crypto.randomUUID();
		const firstChildId = crypto.randomUUID();
		const secondChildId = crypto.randomUUID();

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: quoteId,
					blockType: "emailQuote",
					props: {},
					position: "last",
				},
				{
					type: "insert-block",
					blockId: firstChildId,
					blockType: "paragraph",
					props: {},
					position: { parent: quoteId, index: 0 },
				},
				{
					type: "insert-block",
					blockId: secondChildId,
					blockType: "paragraph",
					props: {},
					position: { parent: quoteId, index: 1 },
				},
			],
			{ origin: "user" },
		);

		// the children are deliberately absent from blockOrder, which is why
		// filtering it cannot find them
		expect(editor.documentState.blockOrder).not.toContain(firstChildId);
		expect(editor.documentState.childrenOf(quoteId)).toEqual([
			firstChildId,
			secondChildId,
		]);
	});

	it("reads children written through the parentId prop, in blockOrder sequence", () => {
		const editor = createEditor();
		const quoteId = crypto.randomUUID();
		const firstChildId = crypto.randomUUID();
		const secondChildId = crypto.randomUUID();

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: quoteId,
					blockType: "emailQuote",
					props: {},
					position: "last",
				},
				{
					type: "insert-block",
					blockId: firstChildId,
					blockType: "paragraph",
					props: { parentId: quoteId },
					position: { after: quoteId },
				},
				{
					type: "insert-block",
					blockId: secondChildId,
					blockType: "paragraph",
					props: { parentId: quoteId },
					position: { after: firstChildId },
				},
			],
			{ origin: "user" },
		);

		expect(editor.documentState.childrenOf(quoteId)).toEqual([
			firstChildId,
			secondChildId,
		]);
	});

	it("is the inverse of parentOf under both nesting routes", () => {
		const editor = createEditor();
		const quoteId = crypto.randomUUID();
		const nestedChildId = crypto.randomUUID();
		const parentIdChildId = crypto.randomUUID();

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: quoteId,
					blockType: "emailQuote",
					props: {},
					position: "last",
				},
				{
					type: "insert-block",
					blockId: nestedChildId,
					blockType: "paragraph",
					props: {},
					position: { parent: quoteId, index: 0 },
				},
				{
					type: "insert-block",
					blockId: parentIdChildId,
					blockType: "paragraph",
					props: { parentId: quoteId },
					position: { after: quoteId },
				},
			],
			{ origin: "user" },
		);

		const childIds = editor.documentState.childrenOf(quoteId);
		expect(childIds).toContain(nestedChildId);
		expect(childIds).toContain(parentIdChildId);
		expect(new Set(childIds).size).toBe(childIds.length);
		for (const childId of childIds) {
			expect(editor.documentState.parentOf(childId)).toBe(quoteId);
		}
	});

	it("returns an empty list for blocks without children", () => {
		const editor = createEditor();
		const paragraphId = editor.firstBlock()!.id;

		expect(editor.documentState.childrenOf(paragraphId)).toEqual([]);
		expect(editor.documentState.childrenOf("nonexistent")).toEqual([]);
	});

	it("hides children only when the container's own open prop is false", () => {
		const editor = createEditor();
		const quoteId = crypto.randomUUID();

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: quoteId,
					blockType: "emailQuote",
					props: {},
					position: "last",
				},
			],
			{ origin: "user" },
		);

		expect(
			shouldRenderContainerChildren(editor, editor.getBlock(quoteId)),
		).toBe(true);

		editor.apply(
			[{ type: "set-props", blockId: quoteId, props: { open: false } }],
			{ origin: "user" },
		);
		expect(
			shouldRenderContainerChildren(editor, editor.getBlock(quoteId)),
		).toBe(false);

		editor.apply(
			[{ type: "set-props", blockId: quoteId, props: { open: true } }],
			{ origin: "user" },
		);
		expect(
			shouldRenderContainerChildren(editor, editor.getBlock(quoteId)),
		).toBe(true);
	});

	it("keeps a container whose open prop defaults to false collapsed", () => {
		const editor = createEditor();
		const quoteId = crypto.randomUUID();

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: quoteId,
					blockType: "collapsedQuote",
					props: {},
					position: "last",
				},
			],
			{ origin: "user" },
		);

		expect(
			shouldRenderContainerChildren(editor, editor.getBlock(quoteId)),
		).toBe(false);

		editor.apply(
			[{ type: "set-props", blockId: quoteId, props: { open: true } }],
			{ origin: "user" },
		);
		expect(
			shouldRenderContainerChildren(editor, editor.getBlock(quoteId)),
		).toBe(true);
	});

	it("never renders children for a non-container, even if it has some", () => {
		const editor = createEditor();
		const paragraphId = editor.firstBlock()!.id;

		expect(
			shouldRenderContainerChildren(editor, editor.getBlock(paragraphId)),
		).toBe(false);
		expect(shouldRenderContainerChildren(editor, null)).toBe(false);
	});
});
