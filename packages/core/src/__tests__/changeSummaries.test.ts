import {
	createSummarySource,
	initBlockMap,
	yjsAdapter,
	type RawCommitDelta,
	type YjsCRDTDocument,
} from "@input/pen-crdt-yjs";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
	createBlockIndexSnapshot,
	emptyBlockIndexSnapshot,
} from "../changes/blockIndex";
import { createChangeSummary } from "../changes/mapping";
import {
	buildChangeSummary,
	logicalLengthFromStored,
} from "../changes/summaryBuilder";
import { SUMMARY_LOG_CAPACITY, createSummaryLog } from "../changes/summaryLog";
import type {
	Assoc,
	BlockTextChange,
	PointMapMode,
	StructuralChange,
	TextSplice,
} from "../changes/types";

const MEADOW = "meadow sage";

function meadowIndex() {
	return createBlockIndexSnapshot({
		roots: ["b1"],
		lengthById: { b1: MEADOW.length },
		typeById: { b1: "paragraph" },
	});
}

function emptyDelta(overrides: Partial<RawCommitDelta> = {}): RawCommitDelta {
	return {
		originTag: "user",
		textDeltas: new Map(),
		blockOrderDelta: [],
		childArrayDeltas: new Map(),
		blockMapChanges: new Map(),
		appChanges: new Set(),
		metadataChanges: new Set(),
		...overrides,
	};
}

function textSummary(
	blockId: string,
	splices: readonly TextSplice[],
	index = meadowIndex(),
	structural: readonly StructuralChange[] = [],
	commitId = 1,
): ReturnType<typeof createChangeSummary> {
	const text: BlockTextChange[] = splices.length
		? [{ blockId, splices, formatRanges: [] }]
		: [];
	return createChangeSummary({
		commitId,
		originType: "user",
		text,
		structural,
		index,
	});
}

describe("change summaries — worked examples", () => {
	it("1: remote insert at 0 maps caret and assoc edges", () => {
		const summary = textSummary("b1", [
			{ from: 0, to: 0, insertLength: 5 },
		]);

		expect(summary.mapOffset("b1", 6)).toBe(11);
		expect(summary.mapOffset("b1", 6, -1)).toBe(11);
		expect(summary.mapOffset("b1", 0, -1)).toBe(0);
		expect(summary.mapOffset("b1", 0, 1)).toBe(5);
	});

	it("2: delete {3..9} covers clamp and all delete modes", () => {
		const summary = textSummary("b1", [
			{ from: 3, to: 9, insertLength: 0 },
		]);
		const deleteModes: PointMapMode[] = [
			"delete",
			"delete-before",
			"delete-after",
		];

		expect(summary.mapOffset("b1", 5, 1, "clamp")).toBe(3);
		for (const mode of deleteModes) {
			expect(summary.mapOffset("b1", 5, 1, mode)).toBeNull();
		}

		expect(summary.mapOffset("b1", 9, 1, "clamp")).toBe(3);
		expect(summary.mapOffset("b1", 9, 1, "delete-after")).toBe(3);
		expect(summary.mapOffset("b1", 9, 1, "delete-before")).toBeNull();

		expect(summary.mapOffset("b1", 11)).toBe(5);
	});

	it("3: split b1 at 6 creating b2 remaps points by assoc", () => {
		const summary = createChangeSummary({
			commitId: 1,
			originType: "user",
			text: [],
			structural: [
				{
					type: "block-split",
					blockId: "b1",
					newBlockId: "b2",
					offset: 6,
				},
			],
			index: meadowIndex(),
		});

		expect(summary.mapPoint({ blockId: "b1", offset: 9 })).toEqual({
			blockId: "b2",
			offset: 3,
		});
		expect(summary.mapPoint({ blockId: "b1", offset: 6 }, -1)).toEqual({
			blockId: "b1",
			offset: 6,
		});
		expect(summary.mapPoint({ blockId: "b1", offset: 6 }, 1)).toEqual({
			blockId: "b2",
			offset: 0,
		});
	});

	it("4: merge then insert applies re-addressing before splices", () => {
		const index = createBlockIndexSnapshot({
			roots: ["b1", "b2"],
			lengthById: { b1: 6, b2: 5 },
			typeById: { b1: "paragraph", b2: "paragraph" },
		});
		const summary = createChangeSummary({
			commitId: 1,
			originType: "user",
			text: [
				{
					blockId: "b1",
					splices: [{ from: 0, to: 0, insertLength: 2 }],
					formatRanges: [],
				},
			],
			structural: [
				{
					type: "blocks-merged",
					targetBlockId: "b1",
					sourceBlockId: "b2",
					joinOffset: 6,
				},
			],
			index,
		});

		expect(summary.mapPoint({ blockId: "b2", offset: 3 })).toEqual({
			blockId: "b1",
			offset: 11,
		});
	});

	it("5: compose insert-then-delete is identity mapping with empty splices", () => {
		const insert = textSummary(
			"b1",
			[{ from: 0, to: 0, insertLength: 5 }],
			meadowIndex(),
			[],
			1,
		);
		const afterInsert = createBlockIndexSnapshot({
			roots: ["b1"],
			lengthById: { b1: MEADOW.length + 5 },
			typeById: { b1: "paragraph" },
		});
		const remove = textSummary(
			"b1",
			[{ from: 0, to: 5, insertLength: 0 }],
			afterInsert,
			[],
			2,
		);
		const composed = insert.compose(remove);

		for (let offset = 0; offset <= MEADOW.length; offset++) {
			for (const assoc of [-1, 1] as const) {
				expect(composed.mapOffset("b1", offset, assoc)).toBe(offset);
			}
		}
		expect(
			composed.text.find((change) => change.blockId === "b1")?.splices ??
				[],
		).toEqual([]);
		expect(composed.commitId).toBe(2);
	});
});

describe("change summaries — mapOffset case table", () => {
	const modes: PointMapMode[] = [
		"clamp",
		"delete",
		"delete-before",
		"delete-after",
	];
	const assocs: Assoc[] = [-1, 1];

	it("covers both Assoc values and all four PointMapMode values", () => {
		const insert = textSummary("b1", [{ from: 0, to: 0, insertLength: 5 }]);
		const del = textSummary("b1", [{ from: 3, to: 9, insertLength: 0 }]);

		for (const assoc of assocs) {
			expect(insert.mapOffset("b1", 0, assoc)).toBe(assoc === -1 ? 0 : 5);
			expect(del.mapOffset("b1", 5, assoc, "clamp")).toBe(3);
		}

		expect(del.mapOffset("b1", 5, 1, "delete")).toBeNull();
		expect(del.mapOffset("b1", 5, 1, "delete-before")).toBeNull();
		expect(del.mapOffset("b1", 5, 1, "delete-after")).toBeNull();
		expect(del.mapOffset("b1", 9, 1, "delete-before")).toBeNull();
		expect(del.mapOffset("b1", 9, 1, "delete-after")).toBe(3);
		expect(del.mapOffset("b1", 3, 1, "delete-after")).toBeNull();
		expect(del.mapOffset("b1", 3, 1, "clamp")).toBe(3);

		expect(modes).toHaveLength(4);
		expect(assocs).toHaveLength(2);
	});

	it("clamps out-of-range offsets and leaves unmentioned blocks unchanged", () => {
		const summary = textSummary("b1", [
			{ from: 0, to: 0, insertLength: 2 },
		]);
		expect(summary.mapOffset("b1", -4)).toBe(2);
		expect(summary.mapOffset("b1", 100)).toBe(13);
		expect(summary.mapOffset("other", 4)).toBe(0);
	});
});

describe("change summaries — structural variants", () => {
	it("emits all ten StructuralChange variants from the builder", () => {
		const index = createBlockIndexSnapshot({
			roots: ["b1", "b2", "table"],
			lengthById: { b1: 6, b2: 5, table: 0 },
			typeById: {
				b1: "paragraph",
				b2: "paragraph",
				table: "table",
			},
		});

		const inserted = buildChangeSummary(
			emptyDelta({
				blockOrderDelta: [{ retain: 3 }, { insert: ["b3"] }],
				blockMapChanges: new Map([["b3", new Set()]]),
			}),
			index,
			1,
		);
		expect(inserted.structural).toContainEqual({
			type: "block-inserted",
			blockId: "b3",
			parentId: null,
			index: 3,
		});

		const removed = buildChangeSummary(
			emptyDelta({
				blockOrderDelta: [{ retain: 1 }, { delete: 1 }],
			}),
			index,
			2,
		);
		expect(removed.structural).toContainEqual({
			type: "block-removed",
			blockId: "b2",
			parentId: null,
			index: 1,
		});

		const moved = buildChangeSummary(
			emptyDelta({
				blockOrderDelta: [
					{ insert: ["b2"] },
					{ retain: 1 },
					{ delete: 1 },
				],
			}),
			index,
			3,
		);
		expect(
			moved.structural.some((change) => change.type === "block-moved"),
		).toBe(true);

		const converted = buildChangeSummary(
			emptyDelta({
				blockMapChanges: new Map([["b1", new Set(["type"])]]),
			}),
			index,
			4,
		);
		expect(converted.structural).toContainEqual({
			type: "block-converted",
			blockId: "b1",
			fromType: "paragraph",
			toType: "paragraph",
		});

		const props = buildChangeSummary(
			emptyDelta({
				blockMapChanges: new Map([["b1", new Set(["align"])]]),
			}),
			index,
			5,
		);
		expect(props.structural).toContainEqual({
			type: "block-props-changed",
			blockId: "b1",
			keys: ["align"],
		});

		const split = buildChangeSummary(
			emptyDelta({
				originTag: {
					type: "user",
					structural: {
						kind: "split",
						blockId: "b1",
						newBlockId: "b9",
						offset: 3,
					},
				},
				blockOrderDelta: [{ retain: 1 }, { insert: ["b9"] }],
				blockMapChanges: new Map([["b9", new Set()]]),
			}),
			index,
			6,
		);
		expect(split.structural).toContainEqual({
			type: "block-split",
			blockId: "b1",
			newBlockId: "b9",
			offset: 3,
		});
		expect(
			split.structural.some((change) => change.type === "block-inserted"),
		).toBe(false);

		const merged = buildChangeSummary(
			emptyDelta({
				originTag: {
					type: "user",
					structural: {
						kind: "merge",
						targetBlockId: "b1",
						sourceBlockId: "b2",
					},
				},
				blockOrderDelta: [{ retain: 1 }, { delete: 1 }],
			}),
			index,
			7,
		);
		expect(merged.structural).toContainEqual({
			type: "blocks-merged",
			targetBlockId: "b1",
			sourceBlockId: "b2",
			joinOffset: 6,
		});
		expect(
			merged.structural.some((change) => change.type === "block-removed"),
		).toBe(false);

		const table = buildChangeSummary(
			emptyDelta({
				blockMapChanges: new Map([
					["table", new Set(["tableColumns"])],
				]),
			}),
			index,
			8,
		);
		expect(table.structural).toContainEqual({
			type: "table-changed",
			blockId: "table",
		});

		const apps = buildChangeSummary(
			emptyDelta({ appChanges: new Set(["app-1"]) }),
			index,
			9,
		);
		expect(apps.structural).toContainEqual({
			type: "apps-changed",
			appIds: ["app-1"],
		});

		const metadata = buildChangeSummary(
			emptyDelta({ metadataChanges: new Set(["title"]) }),
			index,
			10,
		);
		expect(metadata.structural).toContainEqual({
			type: "metadata-changed",
			namespaces: ["title"],
		});
	});
});

describe("change summaries — sentinel cancellation (I11)", () => {
	it("I11: emptying a block then inserting the sentinel leaves no insertLength artifact", () => {
		const summary = buildChangeSummary(
			emptyDelta({
				textDeltas: new Map([
					["b1", [{ delete: MEADOW.length }, { insert: "\u200B" }]],
				]),
			}),
			meadowIndex(),
			1,
		);
		expect(summary.text).toEqual([
			{
				blockId: "b1",
				splices: [{ from: 0, to: MEADOW.length, insertLength: 0 }],
				formatRanges: [],
			},
		]);
	});

	it("I11: typing into an empty sentinel block is a logical insert at 0", () => {
		const index = createBlockIndexSnapshot({
			roots: ["b1"],
			lengthById: { b1: logicalLengthFromStored("\u200B") },
			typeById: { b1: "paragraph" },
		});
		const summary = buildChangeSummary(
			emptyDelta({
				textDeltas: new Map([["b1", [{ delete: 1 }, { insert: "a" }]]]),
			}),
			index,
			1,
		);
		expect(summary.text).toEqual([
			{
				blockId: "b1",
				splices: [{ from: 0, to: 0, insertLength: 1 }],
				formatRanges: [],
			},
		]);
	});
});

describe("change summaries — ring buffer", () => {
	it("between composes across 256 commits and returns null at 257", () => {
		const log = createSummaryLog();
		for (let commitId = 1; commitId <= SUMMARY_LOG_CAPACITY; commitId++) {
			const index = createBlockIndexSnapshot({
				roots: ["b1"],
				lengthById: { b1: MEADOW.length + commitId - 1 },
				typeById: { b1: "paragraph" },
			});
			log.append(
				textSummary(
					"b1",
					[{ from: 0, to: 0, insertLength: 1 }],
					index,
					[],
					commitId,
				),
			);
		}

		const across256 = log.between(0, SUMMARY_LOG_CAPACITY);
		expect(across256).not.toBeNull();
		expect(across256?.mapOffset("b1", 0, 1)).toBe(SUMMARY_LOG_CAPACITY);

		log.append(
			textSummary(
				"b1",
				[{ from: 0, to: 0, insertLength: 1 }],
				createBlockIndexSnapshot({
					roots: ["b1"],
					lengthById: { b1: MEADOW.length + SUMMARY_LOG_CAPACITY },
					typeById: { b1: "paragraph" },
				}),
				[],
				SUMMARY_LOG_CAPACITY + 1,
			),
		);
		expect(log.between(0, SUMMARY_LOG_CAPACITY)).toBeNull();
		expect(log.between(1, SUMMARY_LOG_CAPACITY + 1)).not.toBeNull();
		expect(log.latest()?.commitId).toBe(SUMMARY_LOG_CAPACITY + 1);
	});
});

describe("change summaries — mapRange", () => {
	it("uses default assocs and swaps reverse document order", () => {
		const summary = textSummary("b1", [
			{ from: 0, to: 0, insertLength: 5 },
		]);
		const mapped = summary.mapRange({
			anchor: { blockId: "b1", offset: 0 },
			focus: { blockId: "b1", offset: 2 },
		});
		expect(mapped).toEqual({
			anchor: { blockId: "b1", offset: 0 },
			focus: { blockId: "b1", offset: 7 },
		});

		const reversed = summary.mapRange({
			anchor: { blockId: "b1", offset: 4 },
			focus: { blockId: "b1", offset: 1 },
		});
		expect(reversed).toEqual({
			anchor: { blockId: "b1", offset: 6 },
			focus: { blockId: "b1", offset: 9 },
		});
	});
});

describe("change summaries — remote split clamp fallback", () => {
	it("maps every point to a valid position without split intent metadata", () => {
		const index = meadowIndex();
		const summary = buildChangeSummary(
			emptyDelta({
				blockOrderDelta: [{ retain: 1 }, { insert: ["b2"] }],
				textDeltas: new Map([
					["b1", [{ retain: 6 }, { delete: 5 }]],
					["b2", [{ insert: " sage" }]],
				]),
				blockMapChanges: new Map([["b2", new Set()]]),
			}),
			index,
			1,
		);

		expect(
			summary.structural.some((change) => change.type === "block-split"),
		).toBe(false);
		for (let offset = 0; offset <= MEADOW.length; offset++) {
			const mapped = summary.mapPoint(
				{ blockId: "b1", offset },
				1,
				"clamp",
			);
			expect(mapped).not.toBeNull();
			if (mapped?.blockId === "b1") {
				expect(mapped.offset).toBeGreaterThanOrEqual(0);
				expect(mapped.offset).toBeLessThanOrEqual(6);
			}
		}
	});
});

describe("change summaries — single-code-path", () => {
	it("builder output matches for a local transaction and the same remote update", () => {
		const adapter = yjsAdapter();
		const local = adapter.createDocument() as YjsCRDTDocument;
		local.ydoc.transact(() => {
			initBlockMap(local.penDocument.blocks, "b1", "paragraph", "inline");
			local.penDocument.blockOrder.push(["b1"]);
			(
				local.penDocument.blocks.get("b1")!.get("content") as Y.Text
			).insert(0, MEADOW);
		});
		const remote = adapter.loadDocument(
			adapter.encodeState(local),
		) as YjsCRDTDocument;

		const localDeltas: RawCommitDelta[] = [];
		const remoteDeltas: RawCommitDelta[] = [];
		createSummarySource(local, (delta) => {
			localDeltas.push(delta);
		});
		createSummarySource(remote, (delta) => {
			remoteDeltas.push(delta);
		});

		adapter.transact(local, () => {
			(
				local.penDocument.blocks.get("b1")!.get("content") as Y.Text
			).insert(0, "wild ");
		});
		const update = adapter.encodeUpdate(
			local,
			Y.encodeStateVector(remote.ydoc),
		);
		adapter.applyUpdate(remote, update);

		expect(localDeltas).toHaveLength(1);
		expect(remoteDeltas).toHaveLength(1);

		const index = meadowIndex();
		const localSummary = buildChangeSummary(localDeltas[0]!, index, 1);
		const remoteSummary = buildChangeSummary(remoteDeltas[0]!, index, 1);
		expect(localSummary.text).toEqual(remoteSummary.text);
		expect(localSummary.structural).toEqual(remoteSummary.structural);
		expect(localSummary.mapOffset("b1", 6)).toBe(11);
		expect(remoteSummary.mapOffset("b1", 6)).toBe(11);
	});
});

describe("change summaries — empty commits", () => {
	it("marks selection-only deltas as isEmpty", () => {
		const summary = buildChangeSummary(
			emptyDelta(),
			emptyBlockIndexSnapshot(),
			1,
		);
		expect(summary.isEmpty).toBe(true);
	});
});
