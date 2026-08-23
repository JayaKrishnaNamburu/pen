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
import {
	buildChangeSummary,
	logicalLengthFromStored,
} from "../changes/summaryBuilder";

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

	it("does not drop a nested table-cell delete attributed to a 0-length table", () => {
		const index = createBlockIndexSnapshot({
			roots: ["host4-table"],
			lengthById: { "host4-table": 0 },
			typeById: { "host4-table": "table" },
		});
		const summary = buildChangeSummary(
			emptyDelta({
				textDeltas: new Map([
					["host4-table", [{ delete: 11 }, { insert: "\u200B" }]],
				]),
			}),
			index,
			1,
		);
		expect(summary.text).toEqual([
			{
				blockId: "host4-table",
				splices: [{ from: 0, to: 11, insertLength: 0 }],
				formatRanges: [],
			},
		]);
		expect(summary.isEmpty).toBe(false);
	});

	it("does not drop a one-character nested table-cell delete", () => {
		const index = createBlockIndexSnapshot({
			roots: ["host4-table"],
			lengthById: { "host4-table": 0 },
			typeById: { "host4-table": "table" },
		});
		const summary = buildChangeSummary(
			emptyDelta({
				textDeltas: new Map([["host4-table", [{ delete: 1 }]]]),
			}),
			index,
			1,
		);
		expect(summary.text).toEqual([
			{
				blockId: "host4-table",
				splices: [{ from: 0, to: 1, insertLength: 0 }],
				formatRanges: [],
			},
		]);
	});

	it("keeps a nested table-cell insert on a 0-length table", () => {
		const index = createBlockIndexSnapshot({
			roots: ["host4-table"],
			lengthById: { "host4-table": 0 },
			typeById: { "host4-table": "table" },
		});
		const summary = buildChangeSummary(
			emptyDelta({
				textDeltas: new Map([
					["host4-table", [{ insert: "Cell before" }]],
				]),
			}),
			index,
			1,
		);
		expect(summary.text).toEqual([
			{
				blockId: "host4-table",
				splices: [{ from: 0, to: 0, insertLength: 11 }],
				formatRanges: [],
			},
		]);
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
