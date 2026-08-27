import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
	initBlockMap,
	type BlockContentType,
} from "@input/pen-yjs";
import { exportEditorToJson, jsonDocumentImporter } from "@input/pen-interop/json";
import type { PenBlockJSON, PenDocumentJSON } from "@input/pen-interop/json";
import {
	INIT_BLOCK_MAP_ASSERT_COVERAGE,
	PEN_DOCUMENT_ASSERT_COVERAGE,
} from "../assertDocEquals";
import {
	ASSERT_DOC_EQUALS_FIELDS,
	assertDocEquals,
	createTestEditor,
	resetTestIdCounter,
} from "../index";
import {
	parsePenDocumentKeys,
	readPenDocumentKeys,
} from "../penDocumentSourceKeys";
import type { TestBlock } from "../types";

type Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const TEST_BLOCK_LIST_KEYS = [
	"id",
	"type",
	"props",
	"content",
	"marks",
	"children",
	"table",
] as const satisfies readonly (keyof TestBlock)[];

type _TestBlockListKeysLocked = Assert<
	Equal<(typeof TEST_BLOCK_LIST_KEYS)[number], keyof TestBlock>
>;

const INIT_BLOCK_MAP_CONTENT_TYPES = [
	"inline",
	"table",
	"nested",
	"subdocument",
	"none",
] as const satisfies readonly BlockContentType[];

type _InitBlockMapContentTypesLocked = Assert<
	Equal<BlockContentType, (typeof INIT_BLOCK_MAP_CONTENT_TYPES)[number]>
>;

function collectInitBlockMapKeys(): string[] {
	const keys = new Set<string>();
	const ydoc = new Y.Doc();
	const blocks = ydoc.getMap("blocks") as Y.Map<Y.Map<unknown>>;
	ydoc.transact(() => {
		for (const contentType of INIT_BLOCK_MAP_CONTENT_TYPES) {
			initBlockMap(
				blocks,
				`probe-${contentType}`,
				"paragraph",
				contentType,
			);
		}
	});
	for (const contentType of INIT_BLOCK_MAP_CONTENT_TYPES) {
		const map = blocks.get(`probe-${contentType}`);
		if (!map) {
			throw new Error(
				`initBlockMap did not write probe-${contentType}`,
			);
		}
		for (const key of map.keys()) {
			keys.add(key);
		}
	}
	ydoc.destroy();
	return [...keys].sort();
}

const FIXTURE_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	"../fixtures/durability",
);

interface DurabilitySnapshot {
	id: string;
	rule: "DUR7";
	shape: string;
	kind: "json-export-snapshot";
	document: PenDocumentJSON;
}

const EXPECTED_FIXTURE_IDS = [
	"DUR7-nested-blocks",
	"DUR7-table",
	"DUR7-unknown-block-type",
	"DUR7-unknown-props",
	"DUR7-emoji-rtl",
] as const;

const JSON_IMPORTABLE_FIXTURE_IDS = EXPECTED_FIXTURE_IDS.filter(
	(id) => id !== "DUR7-unknown-block-type",
);

function loadSnapshot(id: string): DurabilitySnapshot {
	const raw = readFileSync(join(FIXTURE_DIR, `${id}.json`), "utf8");
	return JSON.parse(raw) as DurabilitySnapshot;
}

function listSnapshotIds(): string[] {
	return readdirSync(FIXTURE_DIR)
		.filter((name) => name.startsWith("DUR7-") && name.endsWith(".json"))
		.map((name) => name.slice(0, -".json".length))
		.sort();
}

function toHarnessBlock(block: PenBlockJSON): TestBlock {
	if (block.type === "table") {
		return { id: block.id, type: "table" };
	}

	const props = Object.fromEntries(
		Object.entries(block.props).filter(([, value]) => {
			if (value === "" || value === false) return false;
			if (Array.isArray(value) && value.length === 0) return false;
			return true;
		}),
	);

	return {
		id: block.id,
		type: block.type,
		...(Object.keys(props).length > 0 ? { props } : {}),
		...(block.content?.text ? { content: block.content.text } : {}),
	};
}

function blocksFromDocument(document: PenDocumentJSON): TestBlock[] {
	const blocks: TestBlock[] = [];
	for (const block of document.blocks) {
		blocks.push(toHarnessBlock(block));
		if (block.type === "table") continue;
		for (const child of block.children ?? []) {
			if (child.type.startsWith("__")) continue;
			blocks.push(toHarnessBlock(child));
		}
	}
	return blocks;
}

function expectedBlocks(blocks: TestBlock[]): TestBlock[] {
	return blocks.map((block) => ({
		type: block.type,
		...(block.props ? { props: block.props } : {}),
		...(block.content !== undefined ? { content: block.content } : {}),
	}));
}

describe("DUR7 durability corpus", () => {
	it("commits one JSON snapshot per DUR7 shape and no extras", () => {
		expect(listSnapshotIds()).toEqual([...EXPECTED_FIXTURE_IDS].sort());
	});

	for (const id of EXPECTED_FIXTURE_IDS) {
		it(`DUR7: ${id} is stable after load → normalizeAll → re-export`, () => {
			resetTestIdCounter();
			const snapshot = loadSnapshot(id);
			expect(snapshot.rule).toBe("DUR7");
			expect(snapshot.kind).toBe("json-export-snapshot");
			expect(snapshot.id).toBe(id);

			const blocks = blocksFromDocument(snapshot.document);
			const editor = createTestEditor({ blocks });
			editor.normalizeAll();

			expect(exportEditorToJson(editor)).toEqual(snapshot.document);
			expect(() =>
				assertDocEquals(editor, expectedBlocks(blocks)),
			).not.toThrow();

			editor.destroy();
		});
	}

	for (const id of JSON_IMPORTABLE_FIXTURE_IDS) {
		it(`IOP3: ${id} JSON export → import → semantic equality`, () => {
			resetTestIdCounter();
			const snapshot = loadSnapshot(id);
			const imported = createTestEditor({ blocks: [] });
			jsonDocumentImporter.import(snapshot.document, imported, { replace: true });

			expect(exportEditorToJson(imported)).toEqual(snapshot.document);

			imported.destroy();
		});
	}

	it("IOP3: DUR7-unknown-block-type cannot be inserted by JSON import (apply refuses types absent from allBlocks)", () => {
		resetTestIdCounter();
		const snapshot = loadSnapshot("DUR7-unknown-block-type");
		const imported = createTestEditor({ blocks: [] });
		jsonDocumentImporter.import(snapshot.document, imported, { replace: true });

		expect(imported.document.blocks.has("DUR7-host-widget")).toBe(false);
		expect(exportEditorToJson(imported).blocks.some((block) => block.type === "hostWidget")).toBe(
			false,
		);

		imported.destroy();
	});

	it("DUR7: a deliberately mutated fixture fails the suite", () => {
		resetTestIdCounter();
		const snapshot = loadSnapshot("DUR7-emoji-rtl");
		const blocks = blocksFromDocument(snapshot.document);
		const mutatedDocument: PenDocumentJSON = {
			...snapshot.document,
			blocks: snapshot.document.blocks.map((block) => ({
				...block,
				content: block.content
					? { ...block.content, text: `${block.content.text} MUTATED` }
					: { text: "MUTATED" },
			})),
		};
		const editor = createTestEditor({ blocks });
		editor.normalizeAll();

		expect(exportEditorToJson(editor)).not.toEqual(mutatedDocument);
		expect(() =>
			assertDocEquals(editor, [
				{ type: "paragraph", content: "שלום 🌍 مرحبا MUTATED" },
			]),
		).toThrow("content mismatch");

		editor.destroy();
	});

	it("DUR7: assertDocEquals field coverage list is closed", () => {
		const comparedRoots = Object.entries(PEN_DOCUMENT_ASSERT_COVERAGE)
			.filter(([key, kind]) => kind === "compared" && key !== "blocks")
			.map(([key]) => key);
		expect(ASSERT_DOC_EQUALS_FIELDS).toEqual([
			...TEST_BLOCK_LIST_KEYS.map((key) => `block.${key}`),
			...comparedRoots,
		]);
	});

	it("DUR7: PEN_DOCUMENT_ASSERT_COVERAGE matches PenDocument as declared in source", () => {
		const keys = readPenDocumentKeys();
		expect(keys, "could not parse PenDocument from @input/pen-types source").not.toBeNull();
		expect(keys!.length).toBeGreaterThan(0);
		expect([...keys!].sort()).toEqual(
			Object.keys(PEN_DOCUMENT_ASSERT_COVERAGE).sort(),
		);
		expect(
			parsePenDocumentKeys("export interface Other { readonly x: 1 }"),
		).toBeNull();
	});

	it("DUR7: compared PenDocument keys are named in ASSERT_DOC_EQUALS_FIELDS", () => {
		const compared = Object.entries(PEN_DOCUMENT_ASSERT_COVERAGE)
			.filter(([, kind]) => kind === "compared")
			.map(([key]) => key);
		expect(compared.length).toBeGreaterThan(0);
		for (const key of compared) {
			if (key === "blocks") {
				expect(
					ASSERT_DOC_EQUALS_FIELDS.some((field) =>
						field.startsWith("block."),
					),
				).toBe(true);
				continue;
			}
			expect(ASSERT_DOC_EQUALS_FIELDS).toContain(key);
		}
	});

	it("DUR7: initBlockMap stored keys are classified", () => {
		const live = collectInitBlockMapKeys();
		const classified = Object.keys(INIT_BLOCK_MAP_ASSERT_COVERAGE).sort();
		expect(live.length).toBeGreaterThan(0);
		expect(live).toEqual(classified);
	});

	it("DUR7: assertDocEquals compares children and marks", () => {
		resetTestIdCounter();
		const editor = createTestEditor({
			blocks: [
				{
					id: "DUR7-gap-parent",
					type: "layoutRow",
					children: [
						{
							id: "DUR7-gap-child",
							type: "paragraph",
							content: "nested child",
						},
					],
				},
				{ id: "DUR7-gap-text", type: "paragraph", content: "Hello" },
			],
		});
		editor.selectText("DUR7-gap-text", 0, 5);
		editor.simulateKeypress("Mod-b");

		expect(() =>
			assertDocEquals(editor, [
				{ type: "layoutRow" },
				{ type: "paragraph", content: "Hello" },
			]),
		).toThrow("children length mismatch");
		expect(() =>
			assertDocEquals(editor, [
				{
					type: "layoutRow",
					children: [
						{ type: "paragraph", content: "nested child" },
					],
				},
				{ type: "paragraph", content: "Hello" },
			]),
		).toThrow("marks mismatch");
		expect(() =>
			assertDocEquals(editor, [
				{
					type: "layoutRow",
					children: [
						{ type: "paragraph", content: "nested child" },
					],
				},
				{
					type: "paragraph",
					content: "Hello",
					marks: [{ insert: "Hello", attributes: { bold: true } }],
				},
			]),
		).not.toThrow();

		editor.destroy();
	});

	it("DUR7: assertDocEquals compares apps and metadata except penFormat.writer", () => {
		resetTestIdCounter();
		const editorA = createTestEditor({
			blocks: [{ id: "DUR7-meta", type: "paragraph", content: "Same" }],
		});
		resetTestIdCounter();
		const editorB = createTestEditor({
			blocks: [{ id: "DUR7-meta", type: "paragraph", content: "Same" }],
		});

		expect(() => assertDocEquals(editorA, editorB)).not.toThrow();

		const hostApp = new Y.Map<unknown>();
		hostApp.set("type", "host");
		hostApp.set("placement", new Y.Map<unknown>());
		hostApp.set("config", new Y.Map<unknown>());
		editorA.ydoc.getMap("apps").set("hostApp", hostApp);
		expect(() => assertDocEquals(editorA, editorB)).toThrow("apps mismatch");

		const hostAppB = new Y.Map<unknown>();
		hostAppB.set("type", "host");
		hostAppB.set("placement", new Y.Map<unknown>());
		hostAppB.set("config", new Y.Map<unknown>());
		editorB.ydoc.getMap("apps").set("hostApp", hostAppB);
		expect(() => assertDocEquals(editorA, editorB)).not.toThrow();

		editorA.ydoc.getMap("metadata").set("hostNote", "keep");
		expect(() => assertDocEquals(editorA, editorB)).toThrow(
			"metadata mismatch",
		);
		editorB.ydoc.getMap("metadata").set("hostNote", "keep");
		expect(() => assertDocEquals(editorA, editorB)).not.toThrow();

		const stamp = editorA.ydoc.getMap("metadata").get("penFormat") as {
			writer: string;
		};
		stamp.writer = "other-writer";
		expect(() => assertDocEquals(editorA, editorB)).not.toThrow();

		editorA.destroy();
		editorB.destroy();
	});
});
