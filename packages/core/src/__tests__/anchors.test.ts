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

function seedText(editor: ReturnType<typeof createEditor>, text: string): string {
	const blockId = editor.firstBlock()!.id;
	editor.apply([{ type: "insert-text", blockId, offset: 0, text }]);
	return blockId;
}

describe("editor.anchors AN1", () => {
	it("AN1: create returns null and emits anchor-target-missing when the block is gone", () => {
		const editor = createEditor();
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});
		expect(
			editor.anchors.create({ blockId: "missing", offset: 0 }),
		).toBeNull();
		expect(
			diagnostics.some((event) => event.code === "anchor-target-missing"),
		).toBe(true);
		editor.destroy();
	});

	it("AN1: resolve of an anchor whose block was removed is null", () => {
		const editor = createEditor();
		editor.apply([
			{
				type: "insert-block",
				blockId: "keep",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		const initial = editor.firstBlock()!.id;
		editor.apply([{ type: "insert-text", blockId: initial, offset: 0, text: "gone" }]);
		const anchor = editor.anchors.create({ blockId: initial, offset: 2 }, 1)!;
		editor.apply([{ type: "delete-block", blockId: initial }]);
		expect(editor.anchors.resolve(anchor)).toBeNull();
		editor.destroy();
	});
});

describe("editor.anchors AN5", () => {
	it("AN5: deleting a range interior collapses both endpoints", () => {
		const editor = createEditor();
		const blockId = seedText(editor, "meadow sage");
		const range = editor.anchors.range({
			anchor: { blockId, offset: 3 },
			focus: { blockId, offset: 6 },
		})!;
		editor.apply([{ type: "delete-text", blockId, offset: 3, length: 3 }]);
		const resolved = editor.anchors.resolveRange(range);
		expect(resolved).toEqual({
			from: { blockId, offset: 3 },
			to: { blockId, offset: 3 },
			collapsed: true,
		});
		editor.destroy();
	});
});

describe("editor.anchors AN6 AN11 AN12", () => {
	it("AN11: serialize is v1 JSON and deserialize stamps wire provenance", () => {
		const editor = createEditor();
		const blockId = seedText(editor, "hello");
		const local = editor.anchors.create({ blockId, offset: 2 }, -1)!;
		expect(local.provenance).toBe("local");
		const wire = JSON.parse(editor.anchors.serialize(local)) as {
			v: number;
			b: string;
			a: number;
			p: string;
		};
		expect(wire).toMatchObject({ v: 1, b: blockId, a: -1 });
		expect(typeof wire.p).toBe("string");
		const restored = editor.anchors.deserialize(editor.anchors.serialize(local))!;
		expect(restored.provenance).toBe("wire");
		expect(restored.blockId).toBe(blockId);
		expect(restored.assoc).toBe(-1);
		expect(editor.anchors.resolve(restored)).toEqual({ blockId, offset: 2 });
		editor.destroy();
	});

	it("AN12: minted anchors are deep-frozen values", () => {
		const editor = createEditor();
		const blockId = seedText(editor, "hello");
		const anchor = editor.anchors.create({ blockId, offset: 1 }, 1)!;
		expect(Object.isFrozen(anchor)).toBe(true);
		expect(() => {
			(anchor as { blockId: string }).blockId = "nope";
		}).toThrow();
		editor.destroy();
	});

	it("AN6: serialize then deserialize then resolve is identity for a live target", () => {
		const editor = createEditor();
		const blockId = seedText(editor, "round trip");
		const anchor = editor.anchors.create({ blockId, offset: 5 }, 1)!;
		const again = editor.anchors.deserialize(editor.anchors.serialize(anchor))!;
		expect(editor.anchors.resolve(again)).toEqual(editor.anchors.resolve(anchor));
		editor.destroy();
	});
});

describe("editor.anchors AN8", () => {
	it("AN8: resolve of the same anchor within one commit hits the adapter once", () => {
		const editor = createEditor();
		const blockId = seedText(editor, "cached");
		const anchor = editor.anchors.create({ blockId, offset: 2 }, 1)!;
		const adapter = editor.internals.adapter;
		let calls = 0;
		const original = adapter.resolveRelativePosition.bind(adapter);
		adapter.resolveRelativePosition = (doc, encoded, options) => {
			calls += 1;
			return original(doc, encoded, options);
		};
		expect(editor.anchors.resolve(anchor)).toEqual({ blockId, offset: 2 });
		expect(editor.anchors.resolve(anchor)).toEqual({ blockId, offset: 2 });
		expect(calls).toBe(1);
		editor.apply([{ type: "insert-text", blockId, offset: 0, text: "xx" }]);
		expect(editor.anchors.resolve(anchor)).toEqual({ blockId, offset: 4 });
		expect(editor.anchors.resolve(anchor)).toEqual({ blockId, offset: 4 });
		expect(calls).toBe(2);
		editor.destroy();
	});
});

describe("editor.anchors AN9", () => {
	it("AN9: minting past 4096 emits one budget diagnostic that names the site", () => {
		const editor = createEditor();
		const blockId = seedText(editor, "budget");
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});
		for (let i = 0; i < 5000; i++) {
			editor.anchors.create({ blockId, offset: 0 }, 1);
		}
		const budget = diagnostics.filter((event) => event.code === "anchor-budget");
		expect(budget).toHaveLength(1);
		expect(typeof budget[0]?.site).toBe("string");
		expect(String(budget[0]?.site)).toContain("anchors.test.ts");
		expect(editor.anchors.liveCount).toBe(5000);
		editor.destroy();
	});
});

describe("editor.anchors AN13", () => {
	it("AN13: local provenance follows the undoer's restored character; wire converges at the boundary", () => {
		const editor = createEditor();
		const blockId = seedText(editor, "hello world");
		const local = editor.anchors.create({ blockId, offset: 6 }, 1)!;
		const wire = editor.anchors.deserialize(editor.anchors.serialize(local))!;
		expect(local.provenance).toBe("local");
		expect(wire.provenance).toBe("wire");
		const undo = editor.internals.adapter.createUndoManager(
			editor.internals.crdtDoc,
		);
		editor.apply([{ type: "delete-text", blockId, offset: 6, length: 5 }]);
		undo.undo();
		expect(editor.anchors.resolve(local)).toEqual({ blockId, offset: 6 });
		expect(editor.anchors.resolve(wire)).toEqual({ blockId, offset: 11 });
		editor.destroy();
	});
});

describe("editor.anchors values", () => {
	it("create never throws and range is null when either end is missing", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		expect(
			editor.anchors.range({
				anchor: { blockId, offset: 0 },
				focus: { blockId: "missing", offset: 0 },
			}),
		).toBeNull();
		editor.destroy();
	});
});
