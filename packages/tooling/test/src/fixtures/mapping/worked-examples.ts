import type { Assoc, Point } from "@input/pen-types";
import type {
	RawCommitDelta,
	YArrayDelta,
	YTextDelta,
} from "@input/pen-crdt-yjs";

export const MEADOW_SAGE = "meadow sage";
export const MEADOW_SAGE_LENGTH = 11;
export const MEADOW_BLOCK_ID = "b1";
export const SPLIT_BLOCK_ID = "b2";

export interface WorkedExampleBlock {
	readonly blockId: string;
	readonly length: number;
	readonly type?: string;
	readonly parentId?: string | null;
	readonly index?: number;
}

export interface WorkedExampleDelta {
	readonly originTag?: unknown;
	readonly textDeltas?: Readonly<Record<string, YTextDelta>>;
	readonly blockOrderDelta?: YArrayDelta;
	readonly childArrayDeltas?: Readonly<Record<string, YArrayDelta>>;
	readonly blockMapChanges?: Readonly<Record<string, readonly string[]>>;
	readonly appChanges?: readonly string[];
	readonly metadataChanges?: readonly string[];
}

export interface WorkedExampleMapCase {
	readonly point: Point;
	readonly assoc?: Assoc;
	readonly expected: Point | number | null;
}

export interface WorkedExample {
	readonly id: "1" | "2" | "3" | "4" | "5a" | "5b";
	readonly name: string;
	readonly blocks: readonly WorkedExampleBlock[];
	readonly rootOrder?: readonly string[];
	readonly delta: WorkedExampleDelta;
	readonly cases: readonly WorkedExampleMapCase[];
}

function meadowBlock(length = MEADOW_SAGE_LENGTH): WorkedExampleBlock {
	return {
		blockId: MEADOW_BLOCK_ID,
		length,
		type: "paragraph",
		parentId: null,
		index: 0,
	};
}

export const workedExample1: WorkedExample = {
	id: "1",
	name: "remote insert wild at 0",
	blocks: [meadowBlock()],
	rootOrder: [MEADOW_BLOCK_ID],
	delta: {
		originTag: "collaborator",
		textDeltas: {
			[MEADOW_BLOCK_ID]: [{ insert: "wild " }],
		},
	},
	cases: [
		{ point: { blockId: MEADOW_BLOCK_ID, offset: 6 }, expected: 11 },
		{
			point: { blockId: MEADOW_BLOCK_ID, offset: 0 },
			assoc: -1,
			expected: 0,
		},
		{
			point: { blockId: MEADOW_BLOCK_ID, offset: 0 },
			assoc: 1,
			expected: 5,
		},
	],
};

export const workedExample2: WorkedExample = {
	id: "2",
	name: "delete from 3 to 9",
	blocks: [meadowBlock()],
	rootOrder: [MEADOW_BLOCK_ID],
	delta: {
		textDeltas: {
			[MEADOW_BLOCK_ID]: [{ retain: 3 }, { delete: 6 }],
		},
	},
	cases: [
		{
			point: { blockId: MEADOW_BLOCK_ID, offset: 5 },
			expected: 3,
		},
		{
			point: { blockId: MEADOW_BLOCK_ID, offset: 9 },
			expected: 3,
		},
		{ point: { blockId: MEADOW_BLOCK_ID, offset: 11 }, expected: 5 },
	],
};

export const workedExample3: WorkedExample = {
	id: "3",
	name: "split b1 at 6 creating b2",
	blocks: [meadowBlock()],
	rootOrder: [MEADOW_BLOCK_ID],
	delta: {
		originTag: {
			type: "user",
			structural: {
				kind: "split",
				blockId: MEADOW_BLOCK_ID,
				newBlockId: SPLIT_BLOCK_ID,
				offset: 6,
			},
		},
		textDeltas: {
			[MEADOW_BLOCK_ID]: [{ retain: 6 }, { delete: 5 }],
			[SPLIT_BLOCK_ID]: [{ insert: " sage" }],
		},
		blockOrderDelta: [{ retain: 1 }, { insert: [SPLIT_BLOCK_ID] }],
	},
	cases: [
		{
			point: { blockId: MEADOW_BLOCK_ID, offset: 9 },
			expected: { blockId: SPLIT_BLOCK_ID, offset: 3 },
		},
		{
			point: { blockId: MEADOW_BLOCK_ID, offset: 6 },
			assoc: -1,
			expected: { blockId: MEADOW_BLOCK_ID, offset: 6 },
		},
		{
			point: { blockId: MEADOW_BLOCK_ID, offset: 6 },
			assoc: 1,
			expected: { blockId: SPLIT_BLOCK_ID, offset: 0 },
		},
	],
};

export const workedExample4: WorkedExample = {
	id: "4",
	name: "merge b2 into b1 then insert 2 at 0",
	blocks: [
		{
			blockId: MEADOW_BLOCK_ID,
			length: 6,
			type: "paragraph",
			parentId: null,
			index: 0,
		},
		{
			blockId: SPLIT_BLOCK_ID,
			length: 5,
			type: "paragraph",
			parentId: null,
			index: 1,
		},
	],
	rootOrder: [MEADOW_BLOCK_ID, SPLIT_BLOCK_ID],
	delta: {
		originTag: {
			type: "user",
			structural: {
				kind: "merge",
				targetBlockId: MEADOW_BLOCK_ID,
				sourceBlockId: SPLIT_BLOCK_ID,
			},
		},
		textDeltas: {
			[MEADOW_BLOCK_ID]: [
				{ insert: "xx" },
				{ retain: 6 },
				{ insert: " sage" },
			],
		},
		blockOrderDelta: [{ retain: 1 }, { delete: 1 }],
	},
	cases: [
		{
			point: { blockId: SPLIT_BLOCK_ID, offset: 3 },
			expected: { blockId: MEADOW_BLOCK_ID, offset: 11 },
		},
	],
};

export const workedExample5a: WorkedExample = {
	id: "5a",
	name: "compose A inserts 5 at 0",
	blocks: [meadowBlock()],
	rootOrder: [MEADOW_BLOCK_ID],
	delta: {
		textDeltas: {
			[MEADOW_BLOCK_ID]: [{ insert: "wild " }],
		},
	},
	cases: [],
};

export const workedExample5b: WorkedExample = {
	id: "5b",
	name: "compose B deletes 0 to 5",
	blocks: [meadowBlock(MEADOW_SAGE_LENGTH + 5)],
	rootOrder: [MEADOW_BLOCK_ID],
	delta: {
		textDeltas: {
			[MEADOW_BLOCK_ID]: [{ delete: 5 }],
		},
	},
	cases: [],
};

export const CHANGE_SUMMARY_WORKED_EXAMPLES = [
	workedExample1,
	workedExample2,
	workedExample3,
	workedExample4,
	workedExample5a,
	workedExample5b,
] as const;

export function toRawCommitDelta(delta: WorkedExampleDelta): RawCommitDelta {
	const textDeltas = new Map<string, YTextDelta[]>();
	for (const [blockId, ydelta] of Object.entries(delta.textDeltas ?? {})) {
		textDeltas.set(blockId, [ydelta]);
	}
	const childArrayDeltas = new Map<string, YArrayDelta>();
	for (const [parentId, ydelta] of Object.entries(delta.childArrayDeltas ?? {})) {
		childArrayDeltas.set(parentId, ydelta);
	}
	const blockMapChanges = new Map<string, ReadonlySet<string>>();
	for (const [blockId, keys] of Object.entries(delta.blockMapChanges ?? {})) {
		blockMapChanges.set(blockId, new Set(keys));
	}
	return {
		originTag: delta.originTag,
		textDeltas,
		blockOrderDelta: delta.blockOrderDelta ?? [],
		childArrayDeltas,
		blockMapChanges,
		appChanges: new Set(delta.appChanges ?? []),
		metadataChanges: new Set(delta.metadataChanges ?? []),
	};
}
