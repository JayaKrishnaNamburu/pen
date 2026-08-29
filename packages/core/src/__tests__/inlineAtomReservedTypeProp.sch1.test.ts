import { getYjsDoc } from "@input/pen-yjs";
import type { InlineSchema } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { createEditor as createCoreEditor, SchemaRegistryImpl } from "../index";
import { createDefaultSchema } from "./fixtures/testSchema";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createEditor() {
	return createCoreEditor({
		schema: createDefaultSchema(),
		preset: noDefaultExtensionsPreset,
	});
}

function mentionWithTypeProp(): InlineSchema {
	return {
		type: "typedChip",
		kind: "node",
		propSchema: {
			type: {
				type: "string",
				default: "",
			},
			id: {
				type: "string",
				default: "",
			},
		},
		serialize: {},
	};
}

describe("SCH1: inline atom prop named type", () => {
	it("SCH1: splice-text embed storage cannot keep a prop named type", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: {
					nodeType: "mention",
					props: { id: "1", label: "Ada", type: "user" },
				},
			},
		]);

		const ydoc = getYjsDoc(editor);
		const blockMap = ydoc.getMap("blocks").get(blockId) as
			| {
					get: (
						key: string,
					) => { toDelta?: () => unknown[] } | undefined;
			  }
			| undefined;
		const stored = blockMap?.get("content")?.toDelta?.() ?? [];
		expect(stored).toEqual([
			{
				insert: { type: "mention", id: "1", label: "Ada" },
			},
		]);

		expect(editor.getBlock(blockId)!.inlineDeltas()).toEqual([
			{
				insert: { type: "mention", props: { id: "1", label: "Ada" } },
			},
		]);

		editor.destroy();
	});

	it("SCH1: schema registration rejects an inline-atom prop named type", () => {
		expect(() => {
			new SchemaRegistryImpl({
				inlines: [mentionWithTypeProp()],
			});
		}).toThrow(/prop named "type"/);
	});

	it("SCH1: mark schemas may still declare a prop named type", () => {
		const registry = new SchemaRegistryImpl({
			inlines: [
				{
					type: "highlight",
					kind: "mark",
					propSchema: {
						type: { type: "string", default: "" },
					},
					serialize: {},
				},
			],
		});
		expect(
			registry.resolveInline("highlight")?.propSchema.type,
		).toBeDefined();
	});
});
