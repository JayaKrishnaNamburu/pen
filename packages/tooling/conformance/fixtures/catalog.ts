import type { TestBlock } from "@input/pen-test";

export type FixtureName =
	| "hello-world"
	| "two-paragraph"
	| "deterministic"
	| "windowed-large"
	| "wave3-geometry";

export const FIXTURE_NAMES: readonly FixtureName[] = [
	"hello-world",
	"two-paragraph",
	"deterministic",
];

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
};

export function isLocalFixtureName(
	name: string,
): name is Exclude<FixtureName, "deterministic"> {
	return (
		name === "hello-world" ||
		name === "two-paragraph" ||
		name === "windowed-large" ||
		name === "wave3-geometry"
	);
}

export function isFixtureName(name: string): name is FixtureName {
	return isLocalFixtureName(name) || name === "deterministic";
}
