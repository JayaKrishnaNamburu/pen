import { describe, expect, it } from "vitest";
import { createEditor } from "@pen/core";
import { getSearchController, searchExtension } from "../index";

describe("@pen/search extension", () => {
	it("registers a controller and finds matches across blocks", () => {
		const editor = createEditor({
			extensions: [searchExtension()],
		});
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = "b2";

		editor.apply(
			[
				{
					type: "insert-text",
					blockId: firstBlockId,
					offset: 0,
					text: "hello world",
				},
				{
					type: "insert-block",
					blockId: secondBlockId,
					blockType: "paragraph",
					props: {},
					position: { after: firstBlockId },
				},
				{
					type: "insert-text",
					blockId: secondBlockId,
					offset: 0,
					text: "hello again",
				},
			],
			{ origin: "user" },
		);

		const controller = getSearchController(editor);
		expect(controller).toBeTruthy();

		controller?.open();
		controller?.setQuery("hello");

		const state = controller?.getState();
		expect(state?.matches).toHaveLength(2);
		expect(state?.matches.map((match) => match.blockId)).toEqual([
			firstBlockId,
			secondBlockId,
		]);
		expect(editor.getDecorations().decorations).toHaveLength(2);

		editor.destroy();
	});

	it("navigates matches and replaces the active match", () => {
		const editor = createEditor({
			extensions: [searchExtension()],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "alpha beta alpha",
				},
			],
			{ origin: "user" },
		);

		const controller = getSearchController(editor);
		controller?.setQuery("alpha");
		controller?.next();

		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 11 },
			focus: { blockId, offset: 16 },
		});

		controller?.setReplaceText("omega");
		controller?.replace();

		expect(editor.getBlock(blockId)?.textContent()).toBe("alpha beta omega");

		editor.destroy();
	});

	it("replaces all matches in descending offset order", () => {
		const editor = createEditor({
			extensions: [searchExtension()],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "aa aa aa",
				},
			],
			{ origin: "user" },
		);

		const controller = getSearchController(editor);
		controller?.setQuery("aa");
		controller?.setReplaceText("z");
		controller?.replaceAll();

		expect(editor.getBlock(blockId)?.textContent()).toBe("z z z");
		expect(controller?.getState().matches).toHaveLength(0);

		editor.destroy();
	});

	it("finds and replaces matches inside table cells", () => {
		const editor = createEditor({
			extensions: [searchExtension()],
		});
		const tableBlockId = "table-1";

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: tableBlockId,
					blockType: "table",
					props: {},
					position: "last",
				},
				{
					type: "insert-table-cell-text",
					blockId: tableBlockId,
					row: 0,
					col: 0,
					offset: 0,
					text: "hello table",
				},
			],
			{ origin: "user" },
		);

		const controller = getSearchController(editor);
		controller?.setQuery("hello");

		const state = controller?.getState();
		expect(state?.matches).toHaveLength(1);
		expect(state?.matches[0]).toMatchObject({
			kind: "table-cell",
			blockId: tableBlockId,
			row: 0,
			col: 0,
		});

		controller?.setReplaceText("hi");
		controller?.replace();

		expect(editor.getBlock(tableBlockId)?.tableCell(0, 0)?.textContent()).toBe("hi table");

		editor.destroy();
	});

	it("navigates table-cell matches by selecting the active cell without inline decorations", () => {
		const editor = createEditor({
			extensions: [searchExtension()],
		});
		const tableBlockId = "table-1";

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: tableBlockId,
					blockType: "table",
					props: {},
					position: "last",
				},
				{
					type: "insert-table-cell-text",
					blockId: tableBlockId,
					row: 0,
					col: 0,
					offset: 0,
					text: "alpha one",
				},
				{
					type: "insert-table-cell-text",
					blockId: tableBlockId,
					row: 1,
					col: 0,
					offset: 0,
					text: "alpha two",
				},
			],
			{ origin: "user" },
		);

		const controller = getSearchController(editor);
		controller?.open();
		controller?.setQuery("alpha");
		controller?.next();

		expect(editor.selection).toMatchObject({
			type: "cell",
			blockId: tableBlockId,
			anchor: { row: 1, col: 0 },
			head: { row: 1, col: 0 },
		});
		expect(editor.getDecorations().decorations).toHaveLength(0);

		editor.destroy();
	});

	it("finds and replaces matches inside database cells", () => {
		const editor = createEditor({
			extensions: [searchExtension()],
		});
		const databaseBlockId = "db-1";

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: databaseBlockId,
					blockType: "database",
					props: { title: "Roadmap" },
					position: "last",
				},
				{
					type: "update-table-columns",
					blockId: databaseBlockId,
					columns: [{ id: "name", title: "Name", type: "text" }],
				},
				{
					type: "database-insert-row",
					blockId: databaseBlockId,
					rowId: "row-1",
					values: { name: "hello roadmap" },
				},
			],
			{ origin: "user" },
		);

		const controller = getSearchController(editor);
		controller?.setQuery("hello");

		const state = controller?.getState();
		expect(state?.matches).toHaveLength(1);
		expect(state?.matches[0]).toMatchObject({
			kind: "database-cell",
			blockId: databaseBlockId,
			rowId: "row-1",
			columnId: "name",
		});

		controller?.setReplaceText("hi");
		controller?.replace();

		expect(editor.getBlock(databaseBlockId)?.tableCell(0, 0)?.textContent()).toBe("hi roadmap");

		editor.destroy();
	});

	it("navigates database-cell matches by selecting the active cell without inline decorations", () => {
		const editor = createEditor({
			extensions: [searchExtension()],
		});
		const databaseBlockId = "db-1";

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: databaseBlockId,
					blockType: "database",
					props: { title: "Roadmap" },
					position: "last",
				},
				{
					type: "update-table-columns",
					blockId: databaseBlockId,
					columns: [{ id: "name", title: "Name", type: "text" }],
				},
				{
					type: "database-insert-row",
					blockId: databaseBlockId,
					rowId: "row-1",
					values: { name: "alpha roadmap" },
				},
				{
					type: "database-insert-row",
					blockId: databaseBlockId,
					rowId: "row-2",
					values: { name: "alpha launch" },
				},
			],
			{ origin: "user" },
		);

		const controller = getSearchController(editor);
		controller?.open();
		controller?.setQuery("alpha");
		controller?.next();

		expect(editor.selection).toMatchObject({
			type: "cell",
			blockId: databaseBlockId,
			anchor: { row: 1, col: 0 },
			head: { row: 1, col: 0 },
		});
		expect(editor.getDecorations().decorations).toHaveLength(0);

		editor.destroy();
	});

	it("tracks open and close state", () => {
		const editor = createEditor({
			extensions: [searchExtension()],
		});

		const controller = getSearchController(editor);
		expect(controller?.getState().open).toBe(false);

		controller?.open();
		expect(controller?.getState().open).toBe(true);

		controller?.close();
		expect(controller?.getState().open).toBe(false);

		editor.destroy();
	});

	it("clears search decorations when closed", () => {
		const editor = createEditor({
			extensions: [searchExtension()],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "alpha beta alpha",
				},
			],
			{ origin: "user" },
		);

		const controller = getSearchController(editor);
		controller?.open();
		controller?.setQuery("alpha");

		expect(editor.getDecorations().decorations).toHaveLength(2);

		controller?.close();

		expect(editor.getDecorations().decorations).toHaveLength(0);

		editor.destroy();
	});
});
