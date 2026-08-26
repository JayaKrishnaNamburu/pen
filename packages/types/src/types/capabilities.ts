import type { TableBlockHandle } from "./handles";

export type BlockCapabilityKey = "table";

export type { TableBlockHandle };

export interface BlockCapabilityMap {
	table: TableBlockHandle;
}
