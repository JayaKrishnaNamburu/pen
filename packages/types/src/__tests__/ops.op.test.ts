import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { DocumentOp, StructuredOpOrigin } from "../types/ops";
import type { StructuralChange } from "../types/changes";

type _Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const CLOSED_DOCUMENT_OP_TYPES = [
	"splice-text",
	"format-text",
	"insert-block",
	"delete-block",
	"move-block",
	"set-props",
	"set-meta",
	"grid",
	"app",
	"stream-open",
] as const satisfies readonly DocumentOp["type"][];

type ClosedDocumentOpType = (typeof CLOSED_DOCUMENT_OP_TYPES)[number];

type _ClosedUnionIsExact = _Assert<
	Equal<ClosedDocumentOpType, DocumentOp["type"]>
>;
type _IntentIsOptional = _Assert<
	Equal<StructuredOpOrigin["intent"], string | undefined>
>;

const DELETED_DOCUMENT_OP_TYPES = [
	"insert-text",
	"delete-text",
	"replace-text",
	"insert-inline-node",
	"remove-inline-node",
	"insert-table-cell-text",
	"delete-table-cell-text",
	"format-table-cell-text",
	"update-block",
	"convert-block",
	"update-layout",
	"update-table-columns",
	"split-block",
	"merge-blocks",
	"set-selection",
	"create-app",
	"update-app",
	"delete-app",
	"insert-table-row",
	"delete-table-row",
	"insert-table-column",
	"delete-table-column",
	"merge-table-cells",
	"split-table-cell",
] as const;

const AN14_RECIPE_TYPES = ["block-split", "blocks-merged"] as const;

function opsSource(): string {
	return readFileSync(
		fileURLToPath(new URL("../types/ops.ts", import.meta.url)),
		"utf8",
	);
}

function changesSource(): string {
	return readFileSync(
		fileURLToPath(new URL("../types/changes.ts", import.meta.url)),
		"utf8",
	);
}

function sliceExport(source: string, marker: string): string {
	const start = source.indexOf(marker);
	if (start < 0) {
		throw new Error(`missing ${marker}`);
	}
	const from = source.slice(start);
	const end = from.search(/\nexport /);
	return end === -1 ? from : from.slice(0, end);
}

function parseDocumentOpMembers(source: string): string[] {
	const body = sliceExport(source, "export type DocumentOp =");
	return [...body.matchAll(/\|\s*([A-Za-z][A-Za-z0-9]+)/g)].map(
		(match) => match[1]!,
	);
}

function parseTypeDiscriminant(source: string, ifaceName: string): string {
	const body = sliceExport(source, `export interface ${ifaceName} {`);
	const match = body.match(/\btype:\s*"([^"]+)"/);
	if (match == null) {
		throw new Error(`no type discriminant in ${ifaceName}`);
	}
	return match[1]!;
}

function parseStructuralChangeTypes(source: string): string[] {
	const body = sliceExport(source, "export type StructuralChange =");
	return [...body.matchAll(/\btype:\s*"([^"]+)"/g)].map((match) => match[1]!);
}

function visitClosedOpType(type: DocumentOp["type"]): void {
	switch (type) {
		case "splice-text":
		case "format-text":
		case "insert-block":
		case "delete-block":
		case "move-block":
		case "set-props":
		case "set-meta":
		case "grid":
		case "app":
		case "stream-open":
			return;
		default: {
			const _exhaustive: never = type;
			throw new Error(`unexpected DocumentOp type: ${String(_exhaustive)}`);
		}
	}
}

function visitStructuralChangeType(type: StructuralChange["type"]): void {
	switch (type) {
		case "block-inserted":
		case "block-removed":
		case "block-moved":
		case "block-props-changed":
		case "block-split":
		case "blocks-merged":
		case "table-changed":
		case "apps-changed":
		case "metadata-changed":
			return;
		default: {
			const _exhaustive: never = type;
			throw new Error(
				`unexpected StructuralChange type: ${String(_exhaustive)}`,
			);
		}
	}
}

describe("DocumentOp union (OP1, OP3)", () => {
	it("OP1: DocumentOp is closed at exactly ten named variants", () => {
		const source = opsSource();
		const members = parseDocumentOpMembers(source);
		expect(members).toHaveLength(10);
		expect(new Set(members).size).toBe(10);

		const discriminants = members.map((name) =>
			parseTypeDiscriminant(source, name),
		);
		expect(discriminants).toHaveLength(10);
		expect(discriminants).toEqual([...CLOSED_DOCUMENT_OP_TYPES]);
		expect(CLOSED_DOCUMENT_OP_TYPES).toHaveLength(10);

		for (const type of discriminants) {
			visitClosedOpType(type as DocumentOp["type"]);
		}
		for (const deleted of DELETED_DOCUMENT_OP_TYPES) {
			expect(discriminants).not.toContain(deleted);
		}
	});

	it("OP3: StructuralChange deletes block-converted and keeps the AN14 recipes", () => {
		const types = parseStructuralChangeTypes(changesSource());
		expect(types).toContain("block-props-changed");
		expect(types).not.toContain("block-converted");
		expect(types).toEqual(expect.arrayContaining([...AN14_RECIPE_TYPES]));
		for (const type of types) {
			visitStructuralChangeType(type as StructuralChange["type"]);
		}
	});
});
