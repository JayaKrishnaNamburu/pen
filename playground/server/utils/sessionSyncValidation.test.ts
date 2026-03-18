import { describe, expect, it } from "vitest";
import { parseSerializedEditorState } from "./sessionSyncValidation";

describe("parseSerializedEditorState", () => {
	it("accepts a structurally valid editor state payload", () => {
		expect(
			parseSerializedEditorState({
				generation: 2,
				blockCount: 1,
				selection: {
					type: "text",
					blockId: "block-1",
					anchor: 0,
					focus: 5,
					collapsed: false,
					isMultiBlock: false,
				},
				fieldEditor: null,
				blocks: [
					{
						id: "block-1",
						type: "paragraph",
						props: {},
						text: "hello",
						children: [
							{
								id: "child-1",
								type: "paragraph",
								props: { parentId: "block-1" },
								text: "nested",
							},
						],
						table: {
							columnCount: 1,
							rowCount: 1,
							columns: [{ id: "col-1", title: "Name", type: "text" }],
							rows: [
								{
									id: "row-1",
									index: 0,
									cells: [
										{
											id: "cell-1",
											row: 0,
											col: 0,
											text: "value",
										},
									],
								},
							],
						},
					},
				],
			}),
		).not.toBeNull();
	});

	it("rejects blocks with malformed recursive children", () => {
		expect(
			parseSerializedEditorState({
				generation: 1,
				blockCount: 1,
				selection: null,
				fieldEditor: null,
				blocks: [
					{
						id: "block-1",
						type: "paragraph",
						props: {},
						text: "hello",
						children: [{ type: "paragraph" }],
					},
				],
			}),
		).toBeNull();
	});

	it("rejects malformed table payloads", () => {
		expect(
			parseSerializedEditorState({
				generation: 1,
				blockCount: 1,
				selection: null,
				fieldEditor: null,
				blocks: [
					{
						id: "block-1",
						type: "table",
						props: {},
						text: "",
						table: {
							columnCount: 1,
							rowCount: 1,
							columns: [{ id: "col-1", title: "Name", type: "text" }],
							rows: [
								{
									id: "row-1",
									index: 0,
									cells: [{ row: 0, col: 0, text: "missing id" }],
								},
							],
						},
					},
				],
			}),
		).toBeNull();
	});

	it("rejects malformed selections", () => {
		expect(
			parseSerializedEditorState({
				generation: 1,
				blockCount: 1,
				selection: {
					type: "cell",
					blockId: "block-1",
					anchor: { row: 0 },
					head: { row: 0, col: 0 },
				},
				fieldEditor: null,
				blocks: [],
			}),
		).toBeNull();
	});
});
