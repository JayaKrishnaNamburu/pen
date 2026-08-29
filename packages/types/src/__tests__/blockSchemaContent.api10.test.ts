import { describe, expect, it } from "vitest";
import type { BlockSchema, ContentType, PropSchema } from "../types/schema";

type _Assert<T extends true> = T;

type NoneBlock = BlockSchema<"divider", Record<string, PropSchema>, "none">;
type TableBlock = BlockSchema<"table", Record<string, PropSchema>, "table">;
type NestedBlock = BlockSchema<"section", Record<string, PropSchema>, BlockSchema[]>;
type InlineBlock = BlockSchema<"paragraph", Record<string, PropSchema>, "inline">;

type _NoneAssignsToBare = _Assert<NoneBlock extends BlockSchema ? true : false>;
type _TableAssignsToBare = _Assert<TableBlock extends BlockSchema ? true : false>;
type _NestedAssignsToBare = _Assert<NestedBlock extends BlockSchema ? true : false>;
type _InlineAssignsToBare = _Assert<InlineBlock extends BlockSchema ? true : false>;
type _BareContentIsUnion = _Assert<
	BlockSchema["content"] extends ContentType ? true : false
>;

function _api10HeterogeneousCollection(
	none: NoneBlock,
	table: TableBlock,
	nested: NestedBlock,
	inline: InlineBlock,
): BlockSchema[] {
	return [none, table, nested, inline];
}

describe("API10 BlockSchema content default", () => {
	it("API10: bare BlockSchema accepts every ContentType", () => {
		expect(_api10HeterogeneousCollection).toBeTypeOf("function");
	});
});
