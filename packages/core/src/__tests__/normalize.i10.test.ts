import { createDefaultSchema } from "./fixtures/testSchema";
import type { BlockSchema, CommitEvent } from "@input/pen-types";
import {
	defineBlock,
	mergeSchemas,
	prop,
	SchemaRegistryImpl,
} from "@input/pen-core";
import { describe, expect, it } from "vitest";

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
			counted as unknown as BlockSchema,
			columns as unknown as BlockSchema,
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

describe("normalization in the commit transaction (Wave 2 I10)", () => {
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
				type: "insert-text",
				blockId: "counted-1",
				offset: 0,
				text: "ab",
			},
		]);

		expect(commits).toHaveLength(beforeCount + 1);
		const event = commits[beforeCount]!;
		expect(event.source).toBe("apply");
		expect(event.summary.text).toEqual(
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
				type: "insert-text",
				blockId: "counted-nested",
				offset: 0,
				text: "ab",
			},
		]);

		const nested = editor.getBlock("counted-nested")!;
		expect(nested.props.charCount).toBe([...nested.textContent()].length);

		const adapter = editor.internals.adapter;
		const before = adapter.encodeState(editor.internals.crdtDoc);
		editor.normalizeAll();
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
				type: "insert-text",
				blockId: "counted-left",
				offset: 0,
				text: "ab",
			},
			{
				type: "insert-text",
				blockId: "counted-right",
				offset: 0,
				text: "cd",
			},
		]);

		expect(editor.getBlock("cols")).not.toBeNull();
		const left = editor.getBlock("counted-left")!;
		const right = editor.getBlock("counted-right")!;
		expect(left.props.charCount).toBe([...left.textContent()].length);
		expect(right.props.charCount).toBe([...right.textContent()].length);

		const adapter = editor.internals.adapter;
		const before = adapter.encodeState(editor.internals.crdtDoc);
		editor.normalizeAll();
		editor.normalizeAll();
		expect(adapter.encodeState(editor.internals.crdtDoc)).toEqual(before);

		editor.destroy();
	});
});
