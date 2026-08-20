import type { DocumentOp } from "@input/pen-types";
import { runBothInterleavings } from "./twoPeerHarness";
import {
	concatenatedInlineText,
	countEmptyInlineBlocks,
	findParentCycle,
	getParentId,
	hasParentCycle,
	listBlockIds,
	parentsOf,
	visibleText,
} from "./twoPeerInspect";
import type {
	TestBlock,
	TwoPeerHarness,
	TwoPeerHarnessOptions,
	TwoPeerInterleaving,
} from "./types";

export type Col4Scenario = {
	name: string;
	options: TwoPeerHarnessOptions;
	apply: (harness: TwoPeerHarness) => void;
	invariant: (harness: TwoPeerHarness, interleaving: TwoPeerInterleaving) => void;
};

export function runCol4Scenario(scenario: Col4Scenario): void {
	runBothInterleavings(scenario.options, scenario.apply, scenario.invariant);
}

const SPLIT_TEXT = "HelloWorld";

export const col4SplitSameOffset: Col4Scenario = {
	name: "COL4 concurrent split of the same block at the same offset",
	options: {
		blocks: [{ id: "p1", type: "paragraph", content: SPLIT_TEXT }],
	},
	apply(harness) {
		harness.peerA.editor.apply([
			{
				type: "split-block",
				blockId: "p1",
				offset: 5,
				newBlockId: "split-a",
			},
		]);
		harness.peerB.editor.apply([
			{
				type: "split-block",
				blockId: "p1",
				offset: 5,
				newBlockId: "split-b",
			},
		]);
	},
	invariant(harness) {
		for (const peer of [harness.peerA, harness.peerB]) {
			const text = concatenatedInlineText(peer.editor);
			if (!text.includes("Hello") || !text.includes("World")) {
				throw new Error(
					"COL4 split-same-offset invariant: original content was not preserved",
				);
			}
			if (countEmptyInlineBlocks(peer.editor) > 1) {
				throw new Error(
					"COL4 split-same-offset invariant: more than one empty block remained after normalize",
				);
			}
		}
	},
};

export const col4SplitDifferentOffsets: Col4Scenario = {
	name: "COL4 concurrent split of the same block at different offsets",
	options: {
		blocks: [{ id: "p1", type: "paragraph", content: SPLIT_TEXT }],
	},
	apply(harness) {
		harness.peerA.editor.apply([
			{
				type: "split-block",
				blockId: "p1",
				offset: 5,
				newBlockId: "split-a",
			},
		]);
		harness.peerB.editor.apply([
			{
				type: "split-block",
				blockId: "p1",
				offset: 8,
				newBlockId: "split-b",
			},
		]);
	},
	invariant(harness) {
		for (const peer of [harness.peerA, harness.peerB]) {
			const text = concatenatedInlineText(peer.editor);
			for (const letter of SPLIT_TEXT) {
				if (!text.includes(letter)) {
					throw new Error(
						`COL4 split-different-offsets invariant: missing character "${letter}"`,
					);
				}
			}
		}
	},
};

export const col4MoveToDifferentParents: Col4Scenario = {
	name: "COL4 concurrent move of the same block to different parents",
	options: {
		blocks: [
			{ id: "left", type: "callout", content: "Left", children: [] },
			{ id: "right", type: "callout", content: "Right", children: [] },
			{ id: "mover", type: "paragraph", content: "Move me" },
		],
	},
	apply(harness) {
		harness.peerA.editor.apply([
			{
				type: "move-block",
				blockId: "mover",
				position: { parent: "left", index: 0 },
			},
		]);
		harness.peerB.editor.apply([
			{
				type: "move-block",
				blockId: "mover",
				position: { parent: "right", index: 0 },
			},
		]);
	},
	invariant(harness) {
		for (const peer of [harness.peerA, harness.peerB]) {
			if (!listBlockIds(peer.editor).includes("mover")) {
				throw new Error(
					"COL4 move-to-two-parents invariant: mover block map is missing",
				);
			}
			const parents = parentsOf(peer.editor, "mover");
			if (
				parents.length === 0 ||
				parents.some((parentId) => parentId !== "left" && parentId !== "right")
			) {
				throw new Error(
					`COL4 move-to-two-parents invariant: mover should stay under left/right, found ${parents.join(",")}`,
				);
			}
			if (!concatenatedInlineText(peer.editor).includes("Move me")) {
				throw new Error(
					"COL4 move-to-two-parents invariant: mover text was lost",
				);
			}
		}
	},
};

export const col4DeleteParentWhileChildEdited: Col4Scenario = {
	name: "COL4 delete parent while a child is edited",
	options: {
		blocks: [
			{ id: "parent", type: "toggle", content: "Parent" },
			{
				id: "child",
				type: "paragraph",
				content: "Child",
				props: { parentId: "parent" },
			},
		] satisfies TestBlock[],
	},
	apply(harness) {
		harness.peerA.editor.apply([{ type: "delete-block", blockId: "parent" }]);
		harness.peerB.editor.apply([
			{
				type: "insert-text",
				blockId: "child",
				offset: 5,
				text: " edited",
			},
		]);
	},
	invariant(harness) {
		for (const peer of [harness.peerA, harness.peerB]) {
			if (listBlockIds(peer.editor).includes("parent")) {
				throw new Error(
					"COL4 delete-parent invariant: parent block should be gone",
				);
			}
			if (!listBlockIds(peer.editor).includes("child")) {
				throw new Error(
					"COL4 delete-parent invariant: child block should survive",
				);
			}
			const child = peer.editor.getBlock("child");
			if (visibleText(child.textContent()) !== "Child edited") {
				throw new Error(
					`COL4 delete-parent invariant: child edit missing, got "${child.textContent()}"`,
				);
			}
			if (getParentId(peer.editor, "child") !== null) {
				throw new Error(
					"COL4 delete-parent invariant: dangling parentId should be cleared",
				);
			}
		}
	},
};

export const col4ListReparent: Col4Scenario = {
	name: "COL4 concurrent list re-parenting",
	options: {
		blocks: [
			{ id: "l1", type: "bulletListItem", content: "one" },
			{ id: "l2", type: "bulletListItem", content: "two" },
			{ id: "l3", type: "bulletListItem", content: "three" },
		],
	},
	apply(harness) {
		harness.peerA.editor.apply([
			{
				type: "update-block",
				blockId: "l3",
				props: { parentId: "l1" },
			},
		]);
		harness.peerB.editor.apply([
			{
				type: "update-block",
				blockId: "l3",
				props: { parentId: "l2" },
			},
		]);
	},
	invariant(harness) {
		for (const peer of [harness.peerA, harness.peerB]) {
			const parentId = getParentId(peer.editor, "l3");
			if (parentId !== "l1" && parentId !== "l2") {
				throw new Error(
					`COL4 list re-parent invariant: expected one list parent, found ${parentId}`,
				);
			}
			if (hasParentCycle(peer.editor)) {
				throw new Error("COL4 list re-parent invariant: parent cycle created");
			}
		}
	},
};

export const col4TableRowColumn: Col4Scenario = {
	name: "COL4 concurrent table row and column edits",
	options: {
		blocks: [],
		prepare(editor) {
			editor.apply([
				{
					type: "insert-block",
					blockId: "t1",
					blockType: "table",
					props: {},
					position: "last",
				},
			]);
		},
	},
	apply(harness) {
		harness.peerA.editor.apply([
			{ type: "insert-table-row", blockId: "t1", index: 2 },
		]);
		harness.peerB.editor.apply([
			{ type: "insert-table-column", blockId: "t1", index: 2 },
		]);
	},
	invariant(harness) {
		for (const peer of [harness.peerA, harness.peerB]) {
			const table = peer.editor.getBlock("t1");
			if (table.tableRowCount() !== 3) {
				throw new Error(
					`COL4 table invariant: expected the inserted row to survive, got ${table.tableRowCount()} rows`,
				);
			}
			if (table.tableColumnCount() < 3) {
				throw new Error(
					`COL4 table invariant: expected the inserted column to survive, got ${table.tableColumnCount()} columns`,
				);
			}
			if (!table.tableCell(2, 0) || !table.tableCell(0, 2)) {
				throw new Error(
					"COL4 table invariant: missing the new row or the new column",
				);
			}
		}
	},
};

export const COL4_CONVERGENCE_SCENARIOS: Col4Scenario[] = [
	col4SplitSameOffset,
	col4SplitDifferentOffsets,
	col4MoveToDifferentParents,
	col4DeleteParentWhileChildEdited,
	col4ListReparent,
	col4TableRowColumn,
];

const CYCLE_BLOCKS: TestBlock[] = [
	{ id: "block-a", type: "callout", content: "A", children: [] },
	{ id: "block-b", type: "callout", content: "B", children: [] },
];

export function applyCycleMoves(harness: TwoPeerHarness): void {
	harness.peerA.editor.apply([
		{
			type: "move-block",
			blockId: "block-a",
			position: { parent: "block-b", index: 0 },
		},
	]);
	harness.peerB.editor.apply([
		{
			type: "move-block",
			blockId: "block-b",
			position: { parent: "block-a", index: 0 },
		},
	]);
}

export const col4CycleOptions: TwoPeerHarnessOptions = {
	blocks: CYCLE_BLOCKS,
};

export function assertCycleCurrentlySurvives(harness: TwoPeerHarness): void {
	const cycleA = findParentCycle(harness.peerA.editor);
	const cycleB = findParentCycle(harness.peerB.editor);
	if (!cycleA || !cycleB) {
		throw new Error(
			"COL4 cycle current behavior: expected a surviving parent cycle on both peers",
		);
	}
}

export function assertCycleBrokenWithDiagnostic(
	harness: TwoPeerHarness,
	diagnostics: unknown[],
): void {
	if (hasParentCycle(harness.peerA.editor) || hasParentCycle(harness.peerB.editor)) {
		throw new Error("COL4 cycle guarantee: parent cycle was not broken");
	}
	const found = diagnostics.some((event) => {
		if (!event || typeof event !== "object") return false;
		const code = (event as { code?: unknown }).code;
		return typeof code === "string" && /cycle/i.test(code);
	});
	if (!found) {
		throw new Error("COL4 cycle guarantee: expected a cycle-break diagnostic");
	}
}

const FUZZ_SEED = 20260819;
const FUZZ_ITERATIONS = 64;

export function runCol4SeededFuzz(): void {
	for (let i = 0; i < FUZZ_ITERATIONS; i++) {
		const random = mulberry32(FUZZ_SEED + i);
		const pair = pickOpPair(i, random);
		runBothInterleavings(
			fuzzSeedOptions(),
			(harness) => {
				applyFuzzOp(harness.peerA.editor, pair.a);
				applyFuzzOp(harness.peerB.editor, pair.b);
			},
			() => {
				// convergence is asserted by runBothInterleavings
			},
		);
	}
}

function fuzzSeedOptions(): TwoPeerHarnessOptions {
	return {
		blocks: [
			{ id: "p1", type: "paragraph", content: "Hello World" },
			{ id: "p2", type: "paragraph", content: "Second" },
			{ id: "l1", type: "bulletListItem", content: "one" },
			{ id: "l2", type: "bulletListItem", content: "two" },
		],
		prepare(editor) {
			editor.apply([
				{
					type: "insert-block",
					blockId: "t1",
					blockType: "table",
					props: {},
					position: "last",
				},
			]);
		},
	};
}

type FuzzOp = DocumentOp;

function pickOpPair(
	iteration: number,
	random: () => number,
): { a: FuzzOp; b: FuzzOp } {
	return {
		a: pickOp(`a${iteration}`, random),
		b: pickOp(`b${iteration}`, random),
	};
}

function pickOp(tag: string, random: () => number): FuzzOp {
	const catalog: FuzzOp[] = [
		{ type: "insert-text", blockId: "p1", offset: 5, text: tag },
		{ type: "insert-text", blockId: "p2", offset: 0, text: tag },
		{
			type: "split-block",
			blockId: "p1",
			offset: 1 + Math.floor(random() * 8),
			newBlockId: `split-${tag}`,
		},
		{
			type: "update-block",
			blockId: "l2",
			props: { parentId: random() < 0.5 ? "l1" : null },
		},
		{
			type: "move-block",
			blockId: "p2",
			position: random() < 0.5 ? { after: "p1" } : { before: "p1" },
		},
		{
			type: "insert-block",
			blockId: `n-${tag}`,
			blockType: "paragraph",
			props: {},
			position: "last",
		},
		{ type: "insert-table-row", blockId: "t1", index: 2 },
		{ type: "insert-table-column", blockId: "t1", index: 2 },
	];
	return catalog[Math.floor(random() * catalog.length)]!;
}

function applyFuzzOp(
	editor: TwoPeerHarness["peerA"]["editor"],
	op: FuzzOp,
): void {
	editor.apply([op]);
}

function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
