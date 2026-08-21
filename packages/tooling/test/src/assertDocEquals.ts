import type { PenDocument } from "@input/pen-types";
import { logicalTextFromStored } from "@input/pen-types";
import { deepEqual } from "@input/pen-core";
import type {
	TestBlock,
	TestEditor,
	TestMarkDelta,
	TestTableCell,
	TestTableRow,
} from "./types";

type Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type PenDocumentAssertKind = "compared" | "implicit" | "excluded";

/**
 * How each `keyof PenDocument` is treated by `assertDocEquals`.
 * Adding a key to `PenDocument` without classifying it here fails typecheck.
 *
 * - compared: named in `ASSERT_DOC_EQUALS_FIELDS` (`blocks` via `block.*`)
 * - implicit: compared without a named entry (`blockOrder` is positional)
 * - excluded: not stored document data (`adapter` is session machinery)
 */
export const PEN_DOCUMENT_ASSERT_COVERAGE = {
	blockOrder: "implicit",
	blocks: "compared",
	apps: "compared",
	metadata: "compared",
	adapter: "excluded",
} as const satisfies { [K in keyof PenDocument]-?: PenDocumentAssertKind };

type _PenDocumentCoverageLocked = Assert<
	Equal<keyof PenDocument, keyof typeof PEN_DOCUMENT_ASSERT_COVERAGE>
>;

/**
 * DUR7 fields `assertDocEquals` compares.
 *
 * `keyof PenDocument` is locked by `PEN_DOCUMENT_ASSERT_COVERAGE`.
 * The source-parse test reads `packages/types/src/types/crdt.ts`
 * (turbo typecheck does not rebuild `@input/pen-types`, so a
 * `keyof` lock against `dist` stays green until the next build).
 * After a types rebuild, missing classification also fails typecheck.
 *
 * `block.*` tracks `keyof TestBlock`, the extracted view the comparer
 * walks. Stored Y.Map keys are not a declared type — they are written
 * by `initBlockMap`, the apply pipeline, and `tableGridExecutor`.
 * Known stored keys this list does not name: `meta`, `subdocument`,
 * `layout`, `tableColumns`.
 *
 * The `toEqual` pins review this list's contents and catch a careless
 * edit. They do not couple it to `PenDocument`.
 */
export const ASSERT_DOC_EQUALS_FIELDS = Object.freeze([
	"block.id",
	"block.type",
	"block.props",
	"block.content",
	"block.marks",
	"block.children",
	"block.table",
	"apps",
	"metadata",
] as const);

type AssertDocEqualsField = (typeof ASSERT_DOC_EQUALS_FIELDS)[number];

type ComparedPenDocumentListEntry = {
	[K in keyof typeof PEN_DOCUMENT_ASSERT_COVERAGE]: (typeof PEN_DOCUMENT_ASSERT_COVERAGE)[K] extends "compared"
		? K extends "blocks"
			? never
			: K
		: never;
}[keyof typeof PEN_DOCUMENT_ASSERT_COVERAGE];

type _ComparedPenDocumentKeysListed = Assert<
	Equal<
		ComparedPenDocumentListEntry,
		Extract<AssertDocEqualsField, ComparedPenDocumentListEntry>
	>
>;

type BlockListField = Extract<AssertDocEqualsField, `block.${string}`>;
type ExpectedBlockListField = `block.${keyof TestBlock & string}`;
type _TestBlockFieldsLocked = Assert<
	Equal<BlockListField, ExpectedBlockListField>
>;

/**
 * Keys `initBlockMap` writes on a block Y.Map, classified against the
 * list. There is no TypeScript type for stored block-map keys; this is
 * the classification a live-map probe pins. It does not observe keys
 * written only by apply / `tableGridExecutor` (`layout`, `tableColumns`).
 */
export const INIT_BLOCK_MAP_ASSERT_COVERAGE = {
	type: "block.type",
	props: "block.props",
	content: "block.content",
	tableContent: "block.table",
	children: "block.children",
	meta: "excluded",
	subdocument: "excluded",
} as const;

type InitBlockMapCoverageValue =
	(typeof INIT_BLOCK_MAP_ASSERT_COVERAGE)[keyof typeof INIT_BLOCK_MAP_ASSERT_COVERAGE];
type ComparedInitBlockMapField = Exclude<InitBlockMapCoverageValue, "excluded">;
type _InitBlockMapComparedFieldsListed = Assert<
	ComparedInitBlockMapField extends AssertDocEqualsField ? true : false
>;

type TestBlockMapLike = {
	get(key: string): unknown;
};

type TestPropsMapLike = {
	size: number;
	entries(): Iterable<[string, unknown]>;
};

type ArrayLike = {
	toArray(): unknown[];
};

type TextLike = {
	toString(): string;
	toDelta?: () => readonly TestMarkDelta[];
};

type MapLike = {
	get(key: string): unknown;
	entries(): Iterable<[string, unknown]>;
};

class PenAssertionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PenAssertionError";
	}
}

function isArrayLike(value: unknown): value is ArrayLike {
	return (
		value != null &&
		typeof value === "object" &&
		typeof (value as ArrayLike).toArray === "function"
	);
}

function isTextLike(value: unknown): value is TextLike {
	return (
		value != null &&
		typeof value === "object" &&
		typeof (value as TextLike).toString === "function" &&
		typeof (value as TextLike).toDelta === "function"
	);
}

function isMapLike(value: unknown): value is MapLike {
	return (
		value != null &&
		typeof value === "object" &&
		typeof (value as MapLike).get === "function" &&
		typeof (value as MapLike).entries === "function"
	);
}

function toPlain(value: unknown): unknown {
	if (value == null || typeof value !== "object") {
		return value;
	}
	if (isTextLike(value)) {
		return value.toString();
	}
	if (isArrayLike(value)) {
		return value.toArray().map(toPlain);
	}
	if (isMapLike(value)) {
		const out: Record<string, unknown> = {};
		for (const [key, child] of value.entries()) {
			out[key] = toPlain(child);
		}
		return out;
	}
	if (Array.isArray(value)) {
		return value.map(toPlain);
	}
	return { ...value };
}

function comparableMetadata(value: unknown): unknown {
	const plain = toPlain(value);
	if (plain == null || typeof plain !== "object" || Array.isArray(plain)) {
		return plain;
	}
	const next = { ...(plain as Record<string, unknown>) };
	const stamp = next.penFormat;
	if (stamp != null && typeof stamp === "object" && !Array.isArray(stamp)) {
		const { writer: _writer, ...rest } = stamp as Record<string, unknown>;
		next.penFormat = rest;
	}
	return next;
}

function normalizeMarks(deltas: readonly TestMarkDelta[]): TestMarkDelta[] {
	const marks: TestMarkDelta[] = [];
	for (const delta of deltas) {
		const insert = logicalTextFromStored(String(delta.insert ?? ""));
		const attributes =
			delta.attributes && Object.keys(delta.attributes).length > 0
				? delta.attributes
				: undefined;
		if (insert.length === 0 && attributes == null) {
			continue;
		}
		marks.push(attributes ? { insert, attributes } : { insert });
	}
	return marks;
}

function extractMarks(content: unknown): TestMarkDelta[] {
	if (!isTextLike(content) || content.toDelta == null) {
		return [];
	}
	return normalizeMarks(content.toDelta());
}

/**
 * Logical content for comparison, not storage-faithful Y.Text.
 *
 * Tests write expected blocks in the logical domain (`content: ""` for an
 * empty paragraph). Apply executors persist the empty-block sentinel in
 * storage; comparing that character would fail every empty-block fixture
 * and would treat two live documents that differ only by empty-vs-sentinel
 * storage as unequal when they are the same document logically.
 *
 * `logicalTextFromStored` is exact-equality: only a string that _is_ the
 * sentinel becomes "". A mid-string zero-width space is real content and
 * is compared. The previous `replaceAll` in `normalizeMarks` hid that
 * difference — a self-copy-shaped false pass.
 */
function extractText(content: unknown): string | undefined {
	if (content == null || typeof content.toString !== "function") {
		return undefined;
	}
	const text = logicalTextFromStored(content.toString());
	if (!text) {
		return undefined;
	}
	return text;
}

function extractTable(blockMap: TestBlockMapLike): TestTableRow[] | undefined {
	const tableContent = blockMap.get("tableContent");
	if (!isArrayLike(tableContent)) {
		return undefined;
	}
	const rows: TestTableRow[] = [];
	for (const row of tableContent.toArray()) {
		if (!isMapLike(row)) {
			continue;
		}
		const cellsRaw = row.get("cells");
		const cells: TestTableCell[] = [];
		if (isArrayLike(cellsRaw)) {
			for (const cell of cellsRaw.toArray()) {
				if (!isMapLike(cell)) {
					continue;
				}
				const content = cell.get("content");
				const text = extractText(content);
				const marks = extractMarks(content);
				const next: TestTableCell = {};
				if (text !== undefined) {
					next.content = text;
				}
				if (marks.some((mark) => mark.attributes != null)) {
					next.marks = marks;
				}
				cells.push(next);
			}
		}
		rows.push({ cells });
	}
	return rows;
}

function extractOneBlock(
	blocks: { get(key: string): unknown },
	id: string,
): TestBlock | null {
	const blockMap = blocks.get(id) as TestBlockMapLike | undefined;
	if (!blockMap) {
		return null;
	}

	const type = blockMap.get("type") as string;
	const propsMap = blockMap.get("props") as TestPropsMapLike | undefined;
	const content = blockMap.get("content");
	const block: TestBlock = { id, type };

	if (propsMap && propsMap.size > 0) {
		block.props = {};
		for (const [key, value] of propsMap.entries()) {
			block.props[key] = value;
		}
	}

	const text = extractText(content);
	if (text !== undefined) {
		block.content = text;
	}

	const marks = extractMarks(content);
	if (marks.some((mark) => mark.attributes != null)) {
		block.marks = marks;
	}

	const childIds = blockMap.get("children");
	if (isArrayLike(childIds)) {
		const children: TestBlock[] = [];
		for (const childId of childIds.toArray()) {
			if (typeof childId !== "string") {
				continue;
			}
			const child = extractOneBlock(blocks, childId);
			if (child) {
				children.push(child);
			}
		}
		if (children.length > 0) {
			block.children = children;
		}
	}

	const table = extractTable(blockMap);
	if (table) {
		block.table = table;
	}

	return block;
}

function extractBlocks(
	source: TestEditor | { document: PenDocument },
): TestBlock[] {
	const doc = source.document;
	const result: TestBlock[] = [];

	for (let i = 0; i < doc.blockOrder.length; i++) {
		const id = doc.blockOrder.get(i);
		const block = extractOneBlock(doc.blocks, id);
		if (block) {
			result.push(block);
		}
	}
	return result;
}

function extractRootMap(
	source: TestEditor | { document: PenDocument },
	key: "apps" | "metadata",
): unknown {
	return toPlain(source.document[key]);
}

function hasAttributedMarks(marks: TestMarkDelta[] | undefined): boolean {
	return (marks ?? []).some((mark) => mark.attributes != null);
}

function compareMarks(
	actual: TestMarkDelta[] | undefined,
	expected: TestMarkDelta[] | undefined,
	label: string,
	strict: boolean,
): void {
	if (!strict && expected == null && !hasAttributedMarks(actual)) {
		return;
	}
	if (!deepEqual(actual ?? [], expected ?? [])) {
		throw new PenAssertionError(
			`${label}: marks mismatch -- got ${JSON.stringify(actual ?? [])}, expected ${JSON.stringify(expected ?? [])}`,
		);
	}
}

function compareTable(
	actual: TestTableRow[] | undefined,
	expected: TestTableRow[] | undefined,
	label: string,
	strict: boolean,
): void {
	if (!strict && expected == null) {
		return;
	}
	if (!deepEqual(actual ?? [], expected ?? [])) {
		throw new PenAssertionError(
			`${label}: table mismatch -- got ${JSON.stringify(actual ?? [])}, expected ${JSON.stringify(expected ?? [])}`,
		);
	}
}

function compareBlock(
	actual: TestBlock,
	expected: TestBlock,
	index: number,
	strict: boolean,
): void {
	const label = `Block ${index} (${actual.type})`;

	if (actual.type !== expected.type) {
		throw new PenAssertionError(
			`Block ${index}: type mismatch -- got "${actual.type}", expected "${expected.type}"`,
		);
	}

	if (strict || (actual.id != null && expected.id != null)) {
		if (expected.id != null && actual.id !== expected.id) {
			throw new PenAssertionError(
				`${label}: id mismatch -- got "${actual.id}", expected "${expected.id}"`,
			);
		}
	}

	if (strict) {
		if (!deepEqual(actual.props ?? {}, expected.props ?? {})) {
			throw new PenAssertionError(
				`${label}: props mismatch -- got ${JSON.stringify(actual.props ?? {})}, expected ${JSON.stringify(expected.props ?? {})}`,
			);
		}
	} else if (expected.props) {
		for (const [key, value] of Object.entries(expected.props)) {
			const actualValue = actual.props?.[key];
			if (!deepEqual(actualValue, value)) {
				throw new PenAssertionError(
					`${label}: prop "${key}" mismatch -- ` +
						`got ${JSON.stringify(actualValue)}, expected ${JSON.stringify(value)}`,
				);
			}
		}
	}

	if (expected.content !== undefined || strict) {
		if ((actual.content ?? "") !== (expected.content ?? "")) {
			throw new PenAssertionError(
				`${label}: content mismatch -- ` +
					`got "${actual.content ?? ""}", expected "${expected.content ?? ""}"`,
			);
		}
	}

	compareMarks(actual.marks, expected.marks, label, strict);

	if (strict || expected.children != null || actual.children != null) {
		const actualChildren = actual.children ?? [];
		const expectedChildren = expected.children ?? [];
		if (
			!strict &&
			expected.children == null &&
			actualChildren.length === 0
		) {
			// omitted
		} else if (actualChildren.length !== expectedChildren.length) {
			throw new PenAssertionError(
				`${label}: children length mismatch -- got ${actualChildren.length}, expected ${expectedChildren.length}`,
			);
		} else {
			for (let i = 0; i < actualChildren.length; i++) {
				compareBlock(
					actualChildren[i]!,
					expectedChildren[i]!,
					index,
					strict,
				);
			}
		}
	}

	compareTable(actual.table, expected.table, label, strict);
}

function isDocSource(
	value: TestBlock[] | TestEditor | { document: PenDocument },
): value is TestEditor | { document: PenDocument } {
	return !Array.isArray(value) && value != null && "document" in value;
}

export function assertDocEquals(
	editorOrA: TestEditor | { document: PenDocument },
	expectedOrB: TestBlock[] | TestEditor | { document: PenDocument },
): void {
	const blocksA = extractBlocks(editorOrA);
	const strict = isDocSource(expectedOrB);
	const blocksB = Array.isArray(expectedOrB)
		? expectedOrB
		: extractBlocks(expectedOrB);

	if (blocksA.length !== blocksB.length) {
		throw new PenAssertionError(
			`Document length mismatch: got ${blocksA.length} blocks, expected ${blocksB.length}`,
		);
	}

	for (let i = 0; i < blocksA.length; i++) {
		compareBlock(blocksA[i]!, blocksB[i]!, i, strict);
	}

	if (!strict) {
		return;
	}

	const appsA = extractRootMap(editorOrA, "apps");
	const appsB = extractRootMap(expectedOrB, "apps");
	if (!deepEqual(appsA, appsB)) {
		throw new PenAssertionError(
			`apps mismatch -- got ${JSON.stringify(appsA)}, expected ${JSON.stringify(appsB)}`,
		);
	}

	const metadataA = comparableMetadata(extractRootMap(editorOrA, "metadata"));
	const metadataB = comparableMetadata(
		extractRootMap(expectedOrB, "metadata"),
	);
	if (!deepEqual(metadataA, metadataB)) {
		throw new PenAssertionError(
			`metadata mismatch -- got ${JSON.stringify(metadataA)}, expected ${JSON.stringify(metadataB)}`,
		);
	}
}
