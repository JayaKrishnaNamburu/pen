import type { TableColumnSchema } from "@pen/types";

interface SerializedTableColumn extends TableColumnSchema {
	[key: string]: unknown;
}

interface SerializedTableCell {
	id: string;
	row: number;
	col: number;
	text: string;
}

interface SerializedTableRow {
	id: string;
	index: number;
	cells: SerializedTableCell[];
}

interface SerializedTableContent {
	columnCount: number;
	rowCount: number;
	columns: readonly SerializedTableColumn[];
	rows: SerializedTableRow[];
}

export interface SerializedBlock {
	id: string;
	type: string;
	props: Record<string, unknown>;
	text: string;
	children?: SerializedBlock[];
	table?: SerializedTableContent;
}

export type SerializedSelection =
	| {
		type: "text";
		blockId: string;
		anchor: number;
		focus: number;
		collapsed: boolean;
		isMultiBlock: boolean;
	}
	| {
		type: "block";
		blockIds: string[];
	}
	| {
		type: "cell";
		blockId: string;
		anchor: { row: number; col: number };
		head: { row: number; col: number };
	}
	| {
		type: "app";
		appId: string;
	}
	| null;

export interface SerializedEditorState {
	blockCount: number;
	selection: SerializedSelection;
	fieldEditor: unknown;
	blocks: SerializedBlock[];
}

export function parseSerializedEditorState(
	value: unknown,
): SerializedEditorState | null {
	if (!isRecord(value)) {
		return null;
	}

	const candidate = value as Partial<SerializedEditorState>;
	if (
		!isNonNegativeInteger(candidate.blockCount) ||
		!Array.isArray(candidate.blocks) ||
		!candidate.blocks.every((block) => isSerializedBlock(block)) ||
		!isSerializedSelection(candidate.selection)
	) {
		return null;
	}

	if (
		candidate.fieldEditor !== null &&
		candidate.fieldEditor !== undefined &&
		!isRecord(candidate.fieldEditor)
	) {
		return null;
	}

	return candidate as SerializedEditorState;
}

function isSerializedBlock(value: unknown): value is SerializedBlock {
	if (!isRecord(value)) {
		return false;
	}

	const candidate = value as Partial<SerializedBlock>;
	if (
		typeof candidate.id !== "string" ||
		typeof candidate.type !== "string" ||
		!isRecord(candidate.props) ||
		typeof candidate.text !== "string"
	) {
		return false;
	}

	if (
		candidate.children !== undefined &&
		(!Array.isArray(candidate.children) ||
			!candidate.children.every((child) => isSerializedBlock(child)))
	) {
		return false;
	}

	if (
		candidate.table !== undefined &&
		!isSerializedTableContent(candidate.table)
	) {
		return false;
	}

	return true;
}

function isSerializedTableContent(value: unknown): value is SerializedTableContent {
	if (!isRecord(value)) {
		return false;
	}

	const candidate = value as Partial<SerializedTableContent>;
	return (
		isNonNegativeInteger(candidate.columnCount) &&
		isNonNegativeInteger(candidate.rowCount) &&
		Array.isArray(candidate.columns) &&
		candidate.columns.every((column) => isSerializedTableColumn(column)) &&
		Array.isArray(candidate.rows) &&
		candidate.rows.every((row) => isSerializedTableRow(row))
	);
}

function isSerializedTableColumn(value: unknown): value is SerializedTableColumn {
	if (!isRecord(value)) {
		return false;
	}

	const candidate = value as Partial<SerializedTableColumn>;
	return (
		typeof candidate.id === "string" &&
		typeof candidate.title === "string" &&
		typeof candidate.type === "string" &&
		(candidate.width === undefined || typeof candidate.width === "number") &&
		(candidate.hidden === undefined || typeof candidate.hidden === "boolean") &&
		(candidate.pinned === undefined ||
			candidate.pinned === "left" ||
			candidate.pinned === "right") &&
		(candidate.options === undefined ||
			(Array.isArray(candidate.options) &&
				candidate.options.every((option) => isRecord(option)))) &&
		(candidate.format === undefined || typeof candidate.format === "string") &&
		(candidate.readonly === undefined ||
			typeof candidate.readonly === "boolean")
	);
}

function isSerializedTableRow(value: unknown): value is SerializedTableRow {
	if (!isRecord(value)) {
		return false;
	}

	const candidate = value as Partial<SerializedTableRow>;
	return (
		typeof candidate.id === "string" &&
		isNonNegativeInteger(candidate.index) &&
		Array.isArray(candidate.cells) &&
		candidate.cells.every((cell) => isSerializedTableCell(cell))
	);
}

function isSerializedTableCell(value: unknown): value is SerializedTableCell {
	if (!isRecord(value)) {
		return false;
	}

	const candidate = value as Partial<SerializedTableCell>;
	return (
		typeof candidate.id === "string" &&
		isNonNegativeInteger(candidate.row) &&
		isNonNegativeInteger(candidate.col) &&
		typeof candidate.text === "string"
	);
}

function isSerializedSelection(value: unknown): value is SerializedSelection {
	if (value == null) {
		return value === null;
	}
	if (!isRecord(value) || typeof value.type !== "string") {
		return false;
	}

	if (value.type === "text") {
		return (
			typeof value.blockId === "string" &&
			typeof value.anchor === "number" &&
			typeof value.focus === "number" &&
			typeof value.collapsed === "boolean" &&
			typeof value.isMultiBlock === "boolean"
		);
	}

	if (value.type === "block") {
		return (
			Array.isArray(value.blockIds) &&
			value.blockIds.every((blockId) => typeof blockId === "string")
		);
	}

	if (value.type === "cell") {
		return (
			typeof value.blockId === "string" &&
			isCellCoordinate(value.anchor) &&
			isCellCoordinate(value.head)
		);
	}

	if (value.type === "app") {
		return typeof value.appId === "string";
	}

	return false;
}

function isCellCoordinate(
	value: unknown,
): value is { row: number; col: number } {
	return (
		isRecord(value) &&
		isNonNegativeInteger(value.row) &&
		isNonNegativeInteger(value.col)
	);
}

function isNonNegativeInteger(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		Number.isFinite(value) &&
		value >= 0
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
