import { describe, expect, it } from "vitest";
import type { BlockSchema, ComposableSchema } from "@input/pen-types";
import { defineBlock, SchemaRegistryImpl } from "../index";
import type { DefinedBlockSchema } from "../schema/defineBlock";

type _Assert<T extends true> = T;

const noneBlock = defineBlock("emailQuote", {
	content: "none",
	isContainer: true,
});

const nestedBlock = defineBlock("emailThread", {
	content: [],
	isContainer: true,
});

const labeled = noneBlock.a11y({
	label: "Quoted message",
});

type _DefinedAssignsToBare = _Assert<
	DefinedBlockSchema<"emailQuote"> extends BlockSchema ? true : false
>;
type _NoneResultAssigns = _Assert<
	typeof noneBlock extends BlockSchema ? true : false
>;
type _NestedResultAssigns = _Assert<
	typeof nestedBlock extends BlockSchema ? true : false
>;
type _LabeledAssigns = _Assert<typeof labeled extends BlockSchema ? true : false>;

function _api10ExtendAcceptsDefineBlock(): ComposableSchema {
	return new SchemaRegistryImpl({
		blocks: [noneBlock, nestedBlock, labeled],
	}).extend([noneBlock, nestedBlock]);
}

describe("API10 defineBlock assigns to BlockSchema", () => {
	it("API10: defineBlock nested and none content extend without casts", () => {
		expect(_api10ExtendAcceptsDefineBlock().resolve("emailQuote")?.type).toBe(
			"emailQuote",
		);
	});
});
