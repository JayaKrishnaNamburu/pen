import { describe, expect, it, vi } from "vitest";
import { DatabaseEngine } from "../engine";
import type { Editor } from "@pen/types";
import {
	isContentEditableColumnType,
	DEFAULT_COLUMNS,
	type DatabaseRow,
	type DatabaseDataProvider,
} from "../types";

type DatabaseEngineTestBlock = {
	id: string;
	type: string;
	props: { title: string; dataSource: string };
	tableRowCount(): number;
	tableColumnCount(): number;
	tableColumns(): Array<{
		id: string;
		title: string;
		type: string;
		width: number;
	}>;
	tableCell(r: number, c: number): {
		id: string;
		textContent(): string;
	};
};

type DatabaseEngineTestEditor = {
	getBlock(id: string): DatabaseEngineTestBlock | null;
	selection: null;
	apply(): void;
	selectCell(): void;
	selectCellRange(): void;
};

function createMockEditor(rowCount = 3, colCount = 3) {
	const columns = [
		{ id: "col-0", title: "Name", type: "text", width: 150 },
		{ id: "col-1", title: "Age", type: "number", width: 100 },
		{ id: "col-2", title: "Done", type: "checkbox", width: 80 },
	];

	const cells: Record<string, string> = {
		"0-0": "Alice",
		"0-1": "30",
		"0-2": "true",
		"1-0": "Bob",
		"1-1": "25",
		"1-2": "false",
		"2-0": "Charlie",
		"2-1": "35",
		"2-2": "true",
	};

	const block = {
		id: "block-1",
		type: "database",
		props: { title: "Test DB", dataSource: "local" },
		tableRowCount: () => rowCount,
		tableColumnCount: () => colCount,
		tableColumns: () => columns.slice(0, colCount),
		tableCell: (r: number, c: number) => {
			const key = `${r}-${c}`;
			const text = cells[key] ?? "";
			return {
				id: key,
				textContent: () => text,
			};
		},
	} satisfies DatabaseEngineTestBlock;

	const editor = {
		getBlock: (id: string) => (id === "block-1" ? block : null),
		selection: null,
		apply: () => { },
		selectCell: () => { },
		selectCellRange: () => { },
	} satisfies DatabaseEngineTestEditor;

	return {
		editor: editor as unknown as Editor,
		block,
	};
}

describe("DatabaseEngine", () => {
	it("derives column schema from block", () => {
		const { editor } = createMockEditor();
		const engine = new DatabaseEngine(editor, "block-1");
		const schema = engine.deriveColumnSchema();

		expect(schema).toHaveLength(3);
		expect(schema[0]).toEqual(
			expect.objectContaining({ id: "col-0", title: "Name", type: "text" }),
		);
		expect(schema[1]).toEqual(
			expect.objectContaining({ id: "col-1", title: "Age", type: "number" }),
		);
		expect(schema[2]).toEqual(
			expect.objectContaining({ id: "col-2", title: "Done", type: "checkbox" }),
		);
	});

	it("returns empty schema for missing block", () => {
		const { editor } = createMockEditor();
		const engine = new DatabaseEngine(editor, "nonexistent");
		expect(engine.deriveColumnSchema()).toEqual([]);
	});

	it("derives row data with crdtRowIndex", () => {
		const { editor } = createMockEditor();
		const engine = new DatabaseEngine(editor, "block-1");
		const rows = engine.deriveRowData();

		expect(rows).toHaveLength(3);
		expect(rows[0].id).toBe("row-0");
		expect(rows[0].crdtRowIndex).toBe(0);
		expect(rows[0].cells["col-0"]).toBe("Alice");
		expect(rows[1].crdtRowIndex).toBe(1);
		expect(rows[2].crdtRowIndex).toBe(2);
	});

	it("getRowId returns row.id", () => {
		const { editor } = createMockEditor();
		const engine = new DatabaseEngine(editor, "block-1");
		const row: DatabaseRow = { id: "row-42", crdtRowIndex: 42, cells: {} };
		expect(engine.getRowId(row)).toBe("row-42");
	});
});
describe("DatabaseEngine value parsing", () => {
	const { editor } = createMockEditor();
	const engine = new DatabaseEngine(editor, "block-1");

	it("parses numbers", () => {
		expect(engine.parseCellValue("42", "number")).toBe(42);
		expect(engine.parseCellValue("", "number")).toBeNull();
		expect(engine.parseCellValue("abc", "number")).toBeNull();
	});

	it("parses checkboxes", () => {
		expect(engine.parseCellValue("true", "checkbox")).toBe(true);
		expect(engine.parseCellValue("false", "checkbox")).toBe(false);
		expect(engine.parseCellValue("TRUE", "checkbox")).toBe(true);
	});

	it("parses dates", () => {
		const result = engine.parseCellValue("2024-01-15", "date");
		expect(result).toBeInstanceOf(Date);
		expect(engine.parseCellValue("", "date")).toBeNull();
		expect(engine.parseCellValue("invalid", "date")).toBeNull();
	});

	it("parses multiSelect", () => {
		expect(engine.parseCellValue('["a","b"]', "multiSelect")).toEqual(["a", "b"]);
		expect(engine.parseCellValue("", "multiSelect")).toEqual([]);
		expect(engine.parseCellValue("invalid json", "multiSelect")).toEqual(["invalid json"]);
	});

	it("passes through text types", () => {
		expect(engine.parseCellValue("hello", "text")).toBe("hello");
		expect(engine.parseCellValue("test@test.com", "email")).toBe("test@test.com");
		expect(engine.parseCellValue("https://x.com", "url")).toBe("https://x.com");
		expect(engine.parseCellValue("row-12", "relation")).toBe("row-12");
		expect(engine.parseCellValue("2 + 2", "formula")).toBe("2 + 2");
	});
});
describe("DatabaseEngine value serialization", () => {
	const { editor } = createMockEditor();
	const engine = new DatabaseEngine(editor, "block-1");

	it("serializes numbers", () => {
		expect(engine.serializeCellValue(42, "number")).toBe("42");
		expect(engine.serializeCellValue(null, "number")).toBe("");
	});

	it("serializes checkboxes", () => {
		expect(engine.serializeCellValue(true, "checkbox")).toBe("true");
		expect(engine.serializeCellValue(false, "checkbox")).toBe("false");
	});

	it("serializes dates", () => {
		const d = new Date("2024-01-15T00:00:00.000Z");
		expect(engine.serializeCellValue(d, "date")).toBe(d.toISOString());
	});

	it("serializes multiSelect", () => {
		expect(engine.serializeCellValue(["a", "b"], "multiSelect")).toBe('["a","b"]');
		expect(engine.serializeCellValue(null, "multiSelect")).toBe("");
	});
});
describe("DatabaseEngine validation", () => {
	const { editor } = createMockEditor();
	const engine = new DatabaseEngine(editor, "block-1");

	it("validates numbers", () => {
		expect(engine.validateCellValue("42", "number")).toBeNull();
		expect(engine.validateCellValue("abc", "number")).toBe("Invalid number");
		expect(engine.validateCellValue("", "number")).toBeNull();
	});

	it("validates dates", () => {
		expect(engine.validateCellValue("2024-01-15", "date")).toBeNull();
		expect(engine.validateCellValue("invalid", "date")).toBe("Invalid date");
	});

	it("validates emails", () => {
		expect(engine.validateCellValue("test@test.com", "email")).toBeNull();
		expect(engine.validateCellValue("notanemail", "email")).toBe("Invalid email");
	});

	it("validates URLs", () => {
		expect(engine.validateCellValue("https://example.com", "url")).toBeNull();
		expect(engine.validateCellValue("not a url", "url")).toBe("Invalid URL");
	});
});
describe("DatabaseEngine cell display formatting", () => {
	const { editor } = createMockEditor();
	const engine = new DatabaseEngine(editor, "block-1");

	it("formats numbers with decimals", () => {
		expect(engine.formatCellDisplay("42.5", "number", { style: "plain", decimals: 2 })).toBe("42.50");
	});

	it("formats currency", () => {
		const result = engine.formatCellDisplay("1000", "number", { style: "currency", currency: "USD", decimals: 2 });
		expect(result).toContain("1,000.00");
	});

	it("formats checkboxes", () => {
		expect(engine.formatCellDisplay("true", "checkbox")).toBe("✓");
		expect(engine.formatCellDisplay("false", "checkbox")).toBe("");
	});

	it("formats select ids using option labels", () => {
		expect(
			engine.formatCellDisplay("todo", "select", undefined, [
				{ id: "todo", value: "Todo" },
			]),
		).toBe("Todo");
	});

	it("formats multiSelect ids using option labels", () => {
		expect(
			engine.formatCellDisplay('["todo","done"]', "multiSelect", undefined, [
				{ id: "todo", value: "Todo" },
				{ id: "done", value: "Done" },
			]),
		).toBe("Todo, Done");
	});

	it("returns empty for empty values", () => {
		expect(engine.formatCellDisplay("", "number")).toBe("");
		expect(engine.formatCellDisplay("", "date")).toBe("");
	});
});
describe("DatabaseEngine type coercion", () => {
	const { editor } = createMockEditor();
	const engine = new DatabaseEngine(editor, "block-1");

	it("coerces text to number", () => {
		expect(engine.coerceValue("42", "text", "number")).toBe("42");
		expect(engine.coerceValue("abc", "text", "number")).toBe("");
	});

	it("coerces text to checkbox", () => {
		expect(engine.coerceValue("true", "text", "checkbox")).toBe("true");
		expect(engine.coerceValue("nope", "text", "checkbox")).toBe("false");
	});

	it("coerces number to checkbox", () => {
		expect(engine.coerceValue("1", "number", "checkbox")).toBe("true");
		expect(engine.coerceValue("0", "number", "checkbox")).toBe("false");
	});

	it("coerces select to multiSelect", () => {
		expect(engine.coerceValue("tag1", "select", "multiSelect")).toBe('["tag1"]');
	});

	it("coerces text to select using option ids", () => {
		expect(
			engine.coerceValue("Todo", "text", "select", [{ id: "todo", value: "Todo" }]),
		).toBe("todo");
		expect(
			engine.coerceValue("Missing", "text", "select", [{ id: "todo", value: "Todo" }]),
		).toBe("");
	});

	it("coerces multiSelect to select", () => {
		expect(engine.coerceValue('["tag1","tag2"]', "multiSelect", "select")).toBe("tag1");
		expect(engine.coerceValue("[]", "multiSelect", "select")).toBe("");
	});

	it("coerces multiSelect to relation", () => {
		expect(engine.coerceValue('["row-1","row-2"]', "multiSelect", "relation")).toBe("row-1");
		expect(engine.coerceValue("[]", "multiSelect", "relation")).toBe("");
	});

	it("coerces select to checkbox", () => {
		expect(engine.coerceValue("some-id", "select", "checkbox")).toBe("true");
		expect(engine.coerceValue("", "select", "checkbox")).toBe("");
	});

	it("coerces date to checkbox", () => {
		expect(engine.coerceValue("2024-01-15", "date", "checkbox")).toBe("true");
		expect(engine.coerceValue("", "date", "checkbox")).toBe("");
	});

	it("coerces multiSelect to checkbox", () => {
		expect(engine.coerceValue('["a"]', "multiSelect", "checkbox")).toBe("true");
		expect(engine.coerceValue("", "multiSelect", "checkbox")).toBe("");
	});

	it("preserves value for same type", () => {
		expect(engine.coerceValue("hello", "text", "text")).toBe("hello");
	});

	it("returns empty for empty input", () => {
		expect(engine.coerceValue("", "text", "number")).toBe("");
	});
});
describe("DatabaseEngine sorting", () => {
	const { editor } = createMockEditor();
	const engine = new DatabaseEngine(editor, "block-1");

	it("sorts rows numerically", () => {
		const rows: DatabaseRow[] = [
			{ id: "a", crdtRowIndex: 0, cells: { score: "10" } },
			{ id: "b", crdtRowIndex: 1, cells: { score: "2" } },
		];
		const sorted = engine.sortRows(rows, [{ columnId: "score", direction: "asc" }], [
			{ id: "score", title: "Score", type: "number", columnIndex: 0 },
		]);
		expect(sorted.map((row) => row.id)).toEqual(["b", "a"]);
	});

	it("sorts select rows by option label", () => {
		const rows: DatabaseRow[] = [
			{ id: "a", crdtRowIndex: 0, cells: { status: "done" } },
			{ id: "b", crdtRowIndex: 1, cells: { status: "todo" } },
		];
		const sorted = engine.sortRows(rows, [{ columnId: "status", direction: "asc" }], [
			{
				id: "status",
				title: "Status",
				type: "select",
				columnIndex: 0,
				options: [
					{ id: "todo", value: "Todo" },
					{ id: "done", value: "Done" },
				],
			},
		]);
		expect(sorted.map((row) => row.id)).toEqual(["a", "b"]);
	});
});
