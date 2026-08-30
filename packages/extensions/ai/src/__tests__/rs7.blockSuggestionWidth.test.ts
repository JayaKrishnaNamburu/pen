import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { BlockSuggestion as BlockSuggestionFromTypes } from "@input/pen-types";
import type { BlockSuggestion, PersistentBlockSuggestion } from "../index";

type Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type _ImportedFromAi = Assert<Equal<BlockSuggestion, BlockSuggestionFromTypes>>;

type _NoRuntimeOnlyActions = Assert<
	Equal<
		Exclude<PersistentBlockSuggestion["action"], BlockSuggestion["action"]>,
		never
	>
>;

type _NoContractOnlyActions = Assert<
	Equal<
		Exclude<BlockSuggestion["action"], PersistentBlockSuggestion["action"]>,
		never
	>
>;

type RuntimeFormat = NonNullable<
	NonNullable<PersistentBlockSuggestion["previousState"]>["format"]
>;
type ContractFormat = NonNullable<
	NonNullable<BlockSuggestion["previousState"]>["format"]
>;

type _FormatPreviousStateMatches = Assert<Equal<RuntimeFormat, ContractFormat>>;

function hostSwitch(action: BlockSuggestion["action"]): string {
	switch (action) {
		case "insert-block":
			return "insert-block";
		case "delete-block":
			return "delete-block";
		case "move-block":
			return "move-block";
		case "convert-block":
			return "convert-block";
		case "split-block":
			return "split-block";
		case "format-text":
			return "format-text";
		default: {
			const _exhaustive: never = action;
			return _exhaustive;
		}
	}
}

describe("RS7: BlockSuggestion matches the runtime review item", () => {
	it("RS7: contract and PersistentBlockSuggestion share the same action set", () => {
		const runtimeOnly: Exclude<
			PersistentBlockSuggestion["action"],
			BlockSuggestion["action"]
		>[] = [];
		const contractOnly: Exclude<
			BlockSuggestion["action"],
			PersistentBlockSuggestion["action"]
		>[] = [];
		expect(runtimeOnly).toEqual([]);
		expect(contractOnly).toEqual([]);
	});

	it("RS7: split-block and format-text are host-reachable contract members", () => {
		const split: BlockSuggestion["action"] = "split-block";
		const format: BlockSuggestion["action"] = "format-text";
		expect(hostSwitch(split)).toBe("split-block");
		expect(hostSwitch(format)).toBe("format-text");
	});

	it("RS7: BlockSuggestion is a type-only barrel export", () => {
		const barrel = readFileSync(
			join(dirname(fileURLToPath(import.meta.url)), "..", "index.ts"),
			"utf8",
		);
		expect(barrel).toMatch(/export type \{[\s\S]*\bBlockSuggestion\b/);
		expect(barrel).not.toMatch(/^export \{[^}]*\bBlockSuggestion\b/m);
	});

	it("RS7: published .d.ts exports BlockSuggestion as a type, not a value", () => {
		const dtsPath = join(
			dirname(fileURLToPath(import.meta.url)),
			"..",
			"..",
			"dist",
			"index.d.ts",
		);
		expect(
			existsSync(dtsPath),
			"run the package build before this pin",
		).toBe(true);
		const dts = readFileSync(dtsPath, "utf8");
		expect(dts).toMatch(/\btype BlockSuggestion\b/);
		expect(dts).not.toMatch(
			/^export \{[^}]*\bBlockSuggestion\b[^}]*\} from ["']@input\/pen-types["']/m,
		);
	});
});
