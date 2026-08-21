import { initBlockMap, yjsAdapter } from "@input/pen-crdt-yjs";
import type { CRDTDocument, DiagnosticEvent } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createDefaultSchema } from "./fixtures/testSchema";
import { createHeadlessEditor } from "../index";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

const NIGHTLY = Boolean(process.env.PEN_FUZZ_NIGHTLY);
const SEED_INFO = parseFuzzSeed(process.env.PEN_FUZZ_SEED);
const SEED = SEED_INFO.numeric;
const CASE_COUNT = resolveOpCount();

class Rng {
	private state: number;

	constructor(seed: number) {
		this.state = seed >>> 0;
	}

	next(): number {
		this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
		return this.state / 0x100000000;
	}

	int(max: number): number {
		if (max <= 0) return 0;
		return Math.floor(this.next() * max);
	}

	intIn(min: number, max: number): number {
		return min + this.int(max - min + 1);
	}
}

function parseFuzzSeed(raw: string | undefined): { raw: string; numeric: number } {
	const source = raw && raw.length > 0 ? raw : "20260820";
	const asNumber = Number(source);
	if (Number.isFinite(asNumber)) {
		return { raw: source, numeric: asNumber >>> 0 };
	}
	let hash = 2166136261;
	for (let i = 0; i < source.length; i++) {
		hash ^= source.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return { raw: source, numeric: hash >>> 0 };
}

function resolveOpCount(): number {
	const override = Number(process.env.PEN_FUZZ_OP_COUNT);
	if (Number.isFinite(override) && override > 0) return Math.floor(override);
	return NIGHTLY ? 80 : 20;
}

function label(caseIndex: number, extra = ""): string {
	return `seed=${SEED} (${SEED_INFO.raw}) case=${caseIndex}${extra}`;
}

type RawBlocksMap = Y.Map<Y.Map<unknown>>;

function createEditor(document: CRDTDocument, adapter = yjsAdapter()) {
	return createHeadlessEditor({
		crdt: adapter,
		document,
		schema: createDefaultSchema(),
		preset: noDefaultExtensionsPreset,
	});
}

function populateGeneratedUnknowns(
	adapter: ReturnType<typeof yjsAdapter>,
	rng: Rng,
): { document: CRDTDocument; types: string[]; counts: Map<string, number> } {
	const typeCount = rng.intIn(2, 4);
	const types = Array.from(
		{ length: typeCount },
		(_, index) => `hostType${index}_${rng.int(10_000)}`,
	);
	const counts = new Map<string, number>();
	const document = adapter.createDocument();
	const ydoc = adapter.raw<Y.Doc>(document);
	const blocks = ydoc.getMap("blocks") as RawBlocksMap;
	const blockOrder = ydoc.getArray<string>("blockOrder");

	adapter.transact(document, () => {
		initBlockMap(blocks, "p1", "paragraph", "inline");
		const paragraph = blocks.get("p1")!;
		(paragraph.get("props") as Y.Map<unknown>).set("hostNote", "keep");
		const content = paragraph.get("content") as Y.Text;
		content.insert(0, "Hello world");
		content.format(0, 5, { mysteryMark: "keep", bold: true });
		blockOrder.push(["p1"]);

		for (const type of types) {
			const occurrences = rng.intIn(2, 6);
			counts.set(type, occurrences);
			for (let index = 0; index < occurrences; index++) {
				const id = `${type}-${index}`;
				initBlockMap(blocks, id, type, "inline");
				const block = blocks.get(id)!;
				(block.get("props") as Y.Map<unknown>).set("payload", id);
				(block.get("content") as Y.Text).insert(0, `body-${id}`);
				blockOrder.push([id]);
			}
		}
	});

	return { document, types, counts };
}

describe("DUR3 unknown-content property", () => {
	it("DUR3: one schema-unknown-block per type across generated occurrences; apply still refuses insert", () => {
		const rng = new Rng(SEED);

		for (let caseIndex = 0; caseIndex < CASE_COUNT; caseIndex++) {
			const adapter = yjsAdapter();
			const { document, types, counts } = populateGeneratedUnknowns(
				adapter,
				rng,
			);
			const editor = createEditor(document, adapter);
			const diagnostics: DiagnosticEvent[] = [];
			editor.on("diagnostic", (event) => {
				diagnostics.push(event);
			});

			editor.normalizeAll();
			editor.apply([
				{
					type: "set-meta",
					blockId: "p1",
					namespace: "dur3",
					data: { case: caseIndex },
				},
			]);

			const unknown = diagnostics.filter(
				(event) => event.code === "schema-unknown-block",
			);
			expect(
				unknown.map((event) => event.blockType).sort(),
				label(caseIndex, " types"),
			).toEqual([...types].sort());
			expect(unknown, label(caseIndex, " unknown count")).toHaveLength(
				types.length,
			);

			for (const type of types) {
				const occurrenceCount = counts.get(type)!;
				expect(
					occurrenceCount,
					label(caseIndex, ` ${type} occurrences`),
				).toBeGreaterThan(1);
				const stored = [...editor.documentState.allBlocks()].filter(
					(block) => block.type === type,
				);
				expect(
					stored,
					label(caseIndex, ` ${type} stored`),
				).toHaveLength(occurrenceCount);
				expect(
					stored.every((block) => block.props.payload),
					label(caseIndex, ` ${type} payload`),
				).toBe(true);

				editor.apply([
					{
						type: "insert-block",
						blockId: `new-${type}`,
						blockType: type,
						props: { payload: "new" },
						position: "last",
					},
				]);
				expect(
					editor.getBlock(`new-${type}`),
					label(caseIndex, ` ${type} insert refused`),
				).toBeNull();
			}

			expect(
				diagnostics.filter((event) => event.code === "PEN_APPLY_002"),
				label(caseIndex, " apply refused"),
			).toHaveLength(types.length);
			expect(
				editor.getBlock("p1")?.props.hostNote,
				label(caseIndex, " hostNote"),
			).toBe("keep");

			editor.destroy();
		}
	});

	it("hyphenated nightly seeds hash instead of collapsing to 0", () => {
		expect(Number("99-1-1690000000")).toBeNaN();
		expect(parseFuzzSeed("99-1-1690000000").numeric).not.toBe(0);
		expect(parseFuzzSeed("99-1-1690000000").numeric).toBe(
			parseFuzzSeed("99-1-1690000000").numeric,
		);
		expect(parseFuzzSeed("99-1-1690000000").numeric).not.toBe(
			parseFuzzSeed("99-1-1690000001").numeric,
		);
		expect(parseFuzzSeed("42").numeric).toBe(42);
		expect(parseFuzzSeed(undefined).numeric).toBe(20260820);
	});

	it("seed reproduces the generated-case prefix", () => {
		const rng = new Rng(SEED);
		const first = populateGeneratedUnknowns(yjsAdapter(), rng);
		const fingerprint = first.types.join(",");
		console.log(
			`dur3 fingerprint seed=${SEED} raw=${SEED_INFO.raw} nightly=${NIGHTLY} cases=${CASE_COUNT} firstTypes=${fingerprint}`,
		);
		const again = populateGeneratedUnknowns(yjsAdapter(), new Rng(SEED));
		expect(again.types).toEqual(first.types);
		const other = populateGeneratedUnknowns(
			yjsAdapter(),
			new Rng((SEED + 1) >>> 0),
		);
		expect(other.types).not.toEqual(first.types);
	});
});
