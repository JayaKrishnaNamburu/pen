import type { DiagnosticEvent } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { createEditor as createCoreEditor } from "../index";
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

const HOSTILE: readonly { name: string; input: string }[] = [
	{ name: "empty", input: "" },
	{ name: "not-json", input: "not-json" },
	{ name: "array", input: "[]" },
	{ name: "missing-fields", input: "{}" },
	{
		name: "unknown-version",
		input: JSON.stringify({ v: 2, b: "b1", a: 1, p: "AA==" }),
	},
	{ name: "missing-block", input: JSON.stringify({ v: 1, a: 1, p: "AA==" }) },
	{
		name: "wrong-assoc-type",
		input: JSON.stringify({ v: 1, b: "b1", a: 0, p: "AA==" }),
	},
	{
		name: "assoc-string",
		input: JSON.stringify({ v: 1, b: "b1", a: "1", p: "AA==" }),
	},
	{
		name: "malformed-base64",
		input: JSON.stringify({ v: 1, b: "b1", a: 1, p: "***" }),
	},
	{
		name: "oversize-base64",
		input: JSON.stringify({ v: 1, b: "b1", a: 1, p: "A".repeat(345) }),
	},
	{
		name: "cell-wrong-shape",
		input: JSON.stringify({ v: 1, b: "b1", a: 1, c: "nope", p: "AA==" }),
	},
	{
		name: "cell-short",
		input: JSON.stringify({ v: 1, b: "b1", a: 1, c: [1], p: "AA==" }),
	},
	{
		name: "empty-position",
		input: JSON.stringify({ v: 1, b: "b1", a: 1, p: "" }),
	},
];

describe("editor.anchors AN6 hostile corpus", () => {
	it("AN6: every hostile payload deserializes to null without throwing", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const live = editor.anchors.create({ blockId, offset: 0 }, 1)!;
		const crossDocument = editor.anchors.serialize(live);
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		for (const sample of HOSTILE) {
			expect(
				() => editor.anchors.deserialize(sample.input),
				sample.name,
			).not.toThrow();
			expect(
				editor.anchors.deserialize(sample.input),
				sample.name,
			).toBeNull();
		}

		const truncated = editor.anchors.deserialize(
			JSON.stringify({ v: 1, b: "b1", a: 1, p: "/w8=" }),
		);
		expect(
			truncated === null || editor.anchors.resolve(truncated) === null,
		).toBe(true);

		const peer = createEditor();
		const crossed = peer.anchors.deserialize(crossDocument);
		expect(crossed).not.toBeNull();
		expect(peer.anchors.resolve(crossed!)).toBeNull();
		peer.destroy();

		expect(
			diagnostics.every(
				(event) =>
					event.code === "anchor-decode" ||
					event.code === "anchor-target-missing",
			),
		).toBe(true);
		editor.destroy();
	});

	it("AN10: a live cell payload with c:[row,col] deserializes and resolves on the cell", () => {
		const editor = createEditor();
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
				cell: { row: 1, col: 1 },
				from: 0,
				to: 0,
				insert: "cell text",
			},
		]);
		const live = editor.anchors.create(
			{ blockId: "t1", offset: 5, cell: { row: 1, col: 1 } },
			1,
		)!;
		const restored = editor.anchors.deserialize(
			editor.anchors.serialize(live),
		);
		expect(restored).not.toBeNull();
		expect(restored?.cell).toEqual({ row: 1, col: 1 });
		expect(editor.anchors.resolve(restored!)).toEqual({
			blockId: "t1",
			offset: 5,
			cell: { row: 1, col: 1 },
		});
		editor.destroy();
	});
});
