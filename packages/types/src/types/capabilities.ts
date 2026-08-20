import type { BlockHandle } from "./handles";

export type BlockCapabilityKey = "table";

export type TableBlockHandle = BlockHandle;

export interface BlockCapabilityMap {
	table: TableBlockHandle;
}
