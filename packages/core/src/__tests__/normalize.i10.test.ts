import { createDefaultSchema } from "./fixtures/testSchema";
import type { CommitEvent, Editor } from "@input/pen-types";
import {
	defineBlock,
	mergeSchemas,
	prop,
	SchemaRegistryImpl,
} from "@input/pen-core";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createEditor as createCoreEditor } from "../index";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

const counted = defineBlock("counted", {
	content: "inline",
	props: {
		charCount: prop.number().default(0),
	},
	normalize(block) {
		const nextCount = [...(block.content ?? "")].length;
		if (block.props.charCount === nextCount) {
			return block;
		}
		return {
			...block,
			props: {
				...block.props,
				charCount: nextCount,
			},
		};
	},
});

const columns = defineBlock("columns", {
	content: [],
	isContainer: true,
	layout: {
		modes: ["flex"],
		defaultMode: "flex",
		minChildren: 2,
	},
});

const countedSchema = mergeSchemas(
	createDefaultSchema(),
	new SchemaRegistryImpl({
		blocks: [
			counted,
			columns,
		],
		inlines: [],
	}),
);

function createEditor() {
	return createCoreEditor({
		schema: countedSchema,
		preset: noDefaultExtensionsPreset,
	});
}

function setStoredProp(
	editor: Editor,
	blockId: string,
	key: string,
	value: unknown,
): void {
	const adapter = editor.internals.adapter;
	const ydoc = adapter.raw<Y.Doc>(editor.internals.crdtDoc);
	const blocks = ydoc.getMap("blocks") as Y.Map<Y.Map<unknown>>;
	adapter.transact(
		editor.internals.crdtDoc,
		() => {
			const props = blocks.get(blockId)?.get("props") as
				| Y.Map<unknown>
				| undefined;
			props?.set(key, value);
		},
		{ type: "system" },
	);
}

describe("normalization in the commit transaction (I10)", () => {
	it("I10: normalize writes stay in the same commit summary as the user splice", () => {
		const editor = createEditor();
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});

		editor.apply([
			{
				type: "insert-block",
				blockId: "counted-1",
				blockType: "counted",
				props: {},
				position: "last",
			},
		]);
		expect(commits).toHaveLength(1);

		const beforeCount = commits.length;
		editor.apply([
			{
				type: "splice-text",
				blockId: "counted-1",
				from: 0,
				to: 0,
				insert: "ab",
			},
		]);

		expect(commits).toHaveLength(beforeCount + 1);
		const event = commits[beforeCount]!;
		expect(event.source).toBe("apply");
		expect(event.summary.blockText).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					blockId: "counted-1",
				}),
			]),
		);
		expect(event.summary.structural).toEqual(
			expect.arrayContaining([
				{
					type: "block-props-changed",
					blockId: "counted-1",
					keys: ["charCount"],
				},
			]),
		);

		const block = editor.getBlock("counted-1")!;
		expect(block.props.charCount).toBe([...block.textContent()].length);

		editor.destroy();
	});

	it("I10: a second normalizeAll pass writes nothing, including nested children", () => {
		const editor = createEditor();
		editor.apply([
			{
				type: "insert-block",
				blockId: "parent",
				blockType: "toggle",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "counted-nested",
				blockType: "counted",
				props: {},
				position: { parent: "parent", index: 0 },
			},
			{
				type: "splice-text",
				blockId: "counted-nested",
				from: 0,
				to: 0,
				insert: "ab",
			},
		]);

		expect(editor.documentState.blockOrder).not.toContain("counted-nested");
		setStoredProp(editor, "counted-nested", "charCount", 999);
		expect(editor.getBlock("counted-nested")!.props.charCount).toBe(999);

		editor.normalizeAll();
		const nested = editor.getBlock("counted-nested")!;
		expect(nested.props.charCount).toBe([...nested.textContent()].length);
		expect(nested.props.charCount).not.toBe(999);

		const adapter = editor.internals.adapter;
		const before = adapter.encodeState(editor.internals.crdtDoc);
		editor.normalizeAll();
		expect(adapter.encodeState(editor.internals.crdtDoc)).toEqual(before);
		expect(editor.getBlock("counted-nested")!.props.charCount).toBe(
			[...nested.textContent()].length,
		);

		editor.destroy();
	});

	it("I10: a second normalizeAll pass writes nothing on a layout container", () => {
		const editor = createEditor();
		editor.apply([
			{
				type: "insert-block",
				blockId: "cols",
				blockType: "columns",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "counted-left",
				blockType: "counted",
				props: {},
				position: { parent: "cols", index: 0 },
			},
			{
				type: "insert-block",
				blockId: "counted-right",
				blockType: "counted",
				props: {},
				position: { parent: "cols", index: 1 },
			},
			{
				type: "splice-text",
				blockId: "counted-left",
				from: 0,
				to: 0,
				insert: "ab",
			},
			{
				type: "splice-text",
				blockId: "counted-right",
				from: 0,
				to: 0,
				insert: "cd",
			},
		]);

		expect(editor.getBlock("cols")).not.toBeNull();
		expect(editor.documentState.blockOrder).not.toContain("counted-left");
		expect(editor.documentState.blockOrder).not.toContain("counted-right");
		setStoredProp(editor, "counted-left", "charCount", 999);
		setStoredProp(editor, "counted-right", "charCount", 888);
		expect(editor.getBlock("counted-left")!.props.charCount).toBe(999);
		expect(editor.getBlock("counted-right")!.props.charCount).toBe(888);

		editor.normalizeAll();
		const left = editor.getBlock("counted-left")!;
		const right = editor.getBlock("counted-right")!;
		expect(left.props.charCount).toBe([...left.textContent()].length);
		expect(right.props.charCount).toBe([...right.textContent()].length);
		expect(left.props.charCount).not.toBe(999);
		expect(right.props.charCount).not.toBe(888);

		const adapter = editor.internals.adapter;
		const before = adapter.encodeState(editor.internals.crdtDoc);
		editor.normalizeAll();
		expect(adapter.encodeState(editor.internals.crdtDoc)).toEqual(before);

		editor.destroy();
	});
});
