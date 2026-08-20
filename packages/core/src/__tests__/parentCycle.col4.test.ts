import type { DiagnosticEvent } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { createHeadlessEditor } from "../index";
import { defaultSchema } from "@input/pen-schema-default";

describe("COL4 parent-cycle normalize", () => {
	it("COL4: parentId cycle is broken on the lowest owning block id", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		editor.apply([
			{
				type: "insert-block",
				blockId: "l1",
				blockType: "bulletListItem",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "l2",
				blockType: "bulletListItem",
				props: {},
				position: "last",
			},
			{
				type: "update-block",
				blockId: "l1",
				props: { parentId: "l2" },
			},
			{
				type: "update-block",
				blockId: "l2",
				props: { parentId: "l1" },
			},
		]);

		expect(editor.getBlock("l1")!.props.parentId).toBeFalsy();
		expect(editor.getBlock("l2")!.props.parentId).toBe("l1");
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "parent-cycle",
				level: "warn",
				source: "schema",
			}),
		);

		editor.destroy();
	});
});
