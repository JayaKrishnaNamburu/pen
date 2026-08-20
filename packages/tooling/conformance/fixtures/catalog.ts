import type { TestBlock } from "@input/pen-test";

export type FixtureName = "hello-world" | "two-paragraph" | "deterministic";

export const FIXTURE_NAMES: readonly FixtureName[] = [
	"hello-world",
	"two-paragraph",
	"deterministic",
];

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
};

export function isLocalFixtureName(
	name: string,
): name is Exclude<FixtureName, "deterministic"> {
	return name === "hello-world" || name === "two-paragraph";
}

export function isFixtureName(name: string): name is FixtureName {
	return isLocalFixtureName(name) || name === "deterministic";
}
