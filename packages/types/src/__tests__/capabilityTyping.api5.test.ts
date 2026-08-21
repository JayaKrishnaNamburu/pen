import { describe, expect, it } from "vitest";
import type {
	BlockCapabilityKey,
	BlockCapabilityMap,
} from "../types/capabilities";
import type {
	BlockHandle,
	TableBlockHandle,
	TableCellHandle,
	TableColumnSchema,
	TableRowHandle,
} from "../types/handles";

type _Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const TABLE_ONLY_METHODS = [
	"tableRowCount",
	"tableColumnCount",
	"tableRow",
	"tableCell",
	"tableColumns",
] as const;

type TableOnlyMethod = (typeof TABLE_ONLY_METHODS)[number];
type TableOnlyKeys = Exclude<keyof TableBlockHandle, keyof BlockHandle>;

type _TableOnlySurface = _Assert<Equal<TableOnlyKeys, TableOnlyMethod>>;
type _BlockLacksTableMethods = _Assert<
	Extract<TableOnlyMethod, keyof BlockHandle> extends never ? true : false
>;

type _CapabilityKeysAgree = _Assert<
	Equal<keyof BlockCapabilityMap, BlockCapabilityKey>
>;
type _OnlyTableCapability = _Assert<Equal<BlockCapabilityKey, "table">>;
type _TableMapped = _Assert<
	Equal<BlockCapabilityMap["table"], TableBlockHandle>
>;
type _MappedHandles = _Assert<
	Equal<BlockCapabilityMap[keyof BlockCapabilityMap], TableBlockHandle>
>;
type _AsReturn = _Assert<
	Equal<ReturnType<BlockHandle["as"]>, TableBlockHandle | null>
>;

function _api5CallSiteProbes(
	handle: BlockHandle,
	table: TableBlockHandle,
): void {
	const rowCount: number = table.tableRowCount();
	const columnCount: number = table.tableColumnCount();
	const row: TableRowHandle | null = table.tableRow(0);
	const cell: TableCellHandle | null = table.tableCell(0, 0);
	const columns: readonly TableColumnSchema[] = table.tableColumns();
	void rowCount;
	void columnCount;
	void row;
	void cell;
	void columns;

	// @ts-expect-error API5 tableRowCount is not on BlockHandle
	void handle.tableRowCount;
	// @ts-expect-error API5 tableColumnCount is not on BlockHandle
	void handle.tableColumnCount;
	// @ts-expect-error API5 tableRow is not on BlockHandle
	void handle.tableRow;
	// @ts-expect-error API5 tableCell is not on BlockHandle
	void handle.tableCell;
	// @ts-expect-error API5 tableColumns is not on BlockHandle
	void handle.tableColumns;

	const asTable = handle.as("table");
	type _AsTable = _Assert<Equal<typeof asTable, TableBlockHandle | null>>;
	void asTable?.tableRowCount();

	// @ts-expect-error API5 as("table") is TableBlockHandle | null; narrow before use
	asTable.tableRowCount();
	// @ts-expect-error API5 as("table") is TableBlockHandle | null; assignment requires narrowing
	const _unchecked: TableBlockHandle = asTable;
	void _unchecked;

	// @ts-expect-error API5 capability key is not in BlockCapabilityMap
	handle.as("list");
}

describe("API5 capability typing", () => {
	it("API5: table methods are the only TableBlockHandle-only keys", () => {
		expect(TABLE_ONLY_METHODS).toHaveLength(5);
	});
});
