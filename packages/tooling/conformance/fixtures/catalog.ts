import type { TestBlock } from "@input/pen-test";
import { BIDI_MIXED_BLOCKS } from "./bidi";

export type FixtureName =
	| "hello-world"
	| "two-paragraph"
	| "empty"
	| "deterministic"
	| "windowed-large"
	| "wave3-geometry"
	| "bidi-mixed"
	| "nested-toggle";

export const NESTED_TOGGLE_PARENT_ID = "nest-parent";
export const NESTED_TOGGLE_CHILD_ID = "nest-child";
export const NESTED_TOGGLE_CHILD_TEXT = "Nested child";

const FIXTURE_PRESENT = {
	"hello-world": true,
	"two-paragraph": true,
	empty: true,
	deterministic: true,
	"windowed-large": true,
	"wave3-geometry": true,
	"bidi-mixed": true,
	"nested-toggle": true,
} as const satisfies Record<FixtureName, true>;

export const FIXTURE_NAMES: readonly FixtureName[] = Object.keys(
	FIXTURE_PRESENT,
) as FixtureName[];

export const WINDOWED_LARGE_BLOCK_COUNT = 40;
export const WINDOWED_WINDOW_SIZE = 8;

export function windowedBlockId(index: number): string {
	return `win-${index}`;
}

function windowedLargeBlocks(): TestBlock[] {
	const blocks: TestBlock[] = [];
	for (let index = 0; index < WINDOWED_LARGE_BLOCK_COUNT; index++) {
		blocks.push({
			id: windowedBlockId(index),
			type: "paragraph",
			content: `Window block ${index}`,
		});
	}
	return blocks;
}

export const LOCAL_FIXTURES: Record<
	Exclude<FixtureName, "deterministic">,
	readonly TestBlock[]
> = {
	"hello-world": [
		{
			id: "hello-p1",
			type: "paragraph",
			content: "Hello world",
		},
	],
	empty: [
		{
			id: "empty-p1",
			type: "paragraph",
			content: "",
		},
	],
	"two-paragraph": [
		{
			id: "two-p1",
			type: "paragraph",
			content: "Alpha bravo charlie",
		},
		{
			id: "two-p2",
			type: "paragraph",
			content: "Delta echo foxtrot",
		},
	],
	"windowed-large": windowedLargeBlocks(),
	"wave3-geometry": [
		{
			id: "g5-wrap",
			type: "paragraph",
			content: "AAAAABBBBBCCCCCDDDDDEEEEE",
		},
		{
			id: "g5-empty",
			type: "paragraph",
			content: "",
		},
		{
			id: "g5-atoms",
			type: "paragraph",
			content: "LEFT WRAP ATOM LINE",
		},
		{
			id: "g5-tail",
			type: "paragraph",
			content: "Tail block for boundaries",
		},
	],
	"bidi-mixed": BIDI_MIXED_BLOCKS,
	"nested-toggle": [
		{
			id: NESTED_TOGGLE_PARENT_ID,
			type: "toggle",
			props: { open: true },
			content: "Toggle parent",
			children: [
				{
					id: NESTED_TOGGLE_CHILD_ID,
					type: "paragraph",
					props: { parentId: NESTED_TOGGLE_PARENT_ID },
					content: NESTED_TOGGLE_CHILD_TEXT,
				},
			],
		},
	],
};

export function isLocalFixtureName(
	name: string,
): name is Exclude<FixtureName, "deterministic"> {
	return Object.prototype.hasOwnProperty.call(LOCAL_FIXTURES, name);
}

export function isFixtureName(name: string): name is FixtureName {
	return isLocalFixtureName(name) || name === "deterministic";
}
