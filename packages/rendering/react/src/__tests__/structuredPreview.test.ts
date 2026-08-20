import { afterEach, describe, expect, it } from "vitest";
import type { AIStreamEvent, GenerationStructuredPreviewState } from "@input/pen-ai";
import {
	buildAIStructuredPreviewContentItems,
	buildAIStructuredPreviewSelection,
} from "../utils/structuredPreview";

const realStructuredClone = globalThis.structuredClone;

function setStructuredClone(value: typeof structuredClone | undefined): void {
	Object.defineProperty(globalThis, "structuredClone", {
		value,
		configurable: true,
		writable: true,
	});
}

afterEach(() => {
	setStructuredClone(realStructuredClone);
});

type StructuredPreviewPatch = {
	op: "add" | "remove" | "replace";
	path: string;
	value?: unknown;
};

function createStructuredPreview(
	input: Partial<GenerationStructuredPreviewState>,
): GenerationStructuredPreviewState {
	return {
		planState: input.planState ?? "drafted",
		plan: input.plan ?? {
			kind: "block_convert",
			blockId: "block-1",
			newType: "heading",
		},
		reviewItems: input.reviewItems ?? [
			{
				id: "review-item-1",
				targetKind: "block",
				planKind: "block_convert",
				changeKind: "updated",
				section: "block",
				groupId: "blocks",
				groupLabel: "Blocks",
				label: "Convert block",
				summary: "Converts the block into a heading.",
				bundlePath: [],
				stepIndex: null,
			},
		],
		targets: input.targets ?? [],
	};
}

function createStructuredPreviewEvent(
	input: {
		generationId?: string;
		preview: GenerationStructuredPreviewState;
		patches: readonly StructuredPreviewPatch[];
	},
): AIStreamEvent {
	return {
		type: "structured-preview",
		generationId: input.generationId ?? "generation-1",
		zoneId: "zone-1",
		blockId: "block-1",
		timestamp: 1,
		preview: input.preview,
		patches: input.patches,
	};
}

describe("structured preview stream replay", () => {
	it("replays granular structured preview patches for the active generation", () => {
		const draftedPreview = createStructuredPreview({});
		const validatedPreview = createStructuredPreview({
			planState: "validated",
			plan: {
				kind: "block_convert",
				blockId: "block-1",
				newType: "heading",
				props: { level: 2 },
			},
		});

		const selection = buildAIStructuredPreviewSelection(
			[
				createStructuredPreviewEvent({
					preview: draftedPreview,
					patches: [
						{ op: "add", path: "/planState", value: "drafted" },
						{
							op: "add",
							path: "/plan",
							value: {
								kind: "block_convert",
								blockId: "block-1",
								newType: "heading",
							},
						},
						{
							op: "add",
							path: "/reviewItems",
							value: draftedPreview.reviewItems,
						},
						{
							op: "add",
							path: "/targets",
							value: draftedPreview.targets,
						},
					],
				}),
				createStructuredPreviewEvent({
					preview: validatedPreview,
					patches: [
						{ op: "replace", path: "/planState", value: "validated" },
						{ op: "add", path: "/plan/props", value: {} },
						{ op: "add", path: "/plan/props/level", value: 2 },
					],
				}),
			],
			"generation-1",
			null,
		);

		expect(selection.patchCount).toBe(3);
		expect(selection.preview).toEqual(validatedPreview);
	});

	it("HOST4: replays patches when structuredClone is missing", () => {
		setStructuredClone(undefined);

		const draftedPreview = createStructuredPreview({});
		const validatedPreview = createStructuredPreview({
			planState: "validated",
			plan: {
				kind: "block_convert",
				blockId: "block-1",
				newType: "heading",
				props: { level: 2 },
			},
		});

		const selection = buildAIStructuredPreviewSelection(
			[
				createStructuredPreviewEvent({
					preview: draftedPreview,
					patches: [
						{ op: "add", path: "/planState", value: "drafted" },
						{
							op: "add",
							path: "/plan",
							value: {
								kind: "block_convert",
								blockId: "block-1",
								newType: "heading",
							},
						},
						{
							op: "add",
							path: "/reviewItems",
							value: draftedPreview.reviewItems,
						},
						{
							op: "add",
							path: "/targets",
							value: draftedPreview.targets,
						},
					],
				}),
				createStructuredPreviewEvent({
					preview: validatedPreview,
					patches: [
						{ op: "replace", path: "/planState", value: "validated" },
						{ op: "add", path: "/plan/props", value: {} },
						{ op: "add", path: "/plan/props/level", value: 2 },
					],
				}),
			],
			"generation-1",
			null,
		);

		expect(selection.patchCount).toBe(3);
		expect(selection.preview).toEqual(validatedPreview);
	});

	it("ignores preview events from other generations and falls back cleanly", () => {
		const fallbackPreview = createStructuredPreview({
			planState: "validated",
		});

		const selection = buildAIStructuredPreviewSelection(
			[
				createStructuredPreviewEvent({
					generationId: "generation-2",
					preview: fallbackPreview,
					patches: [
						{ op: "replace", path: "/planState", value: "validated" },
					],
				}),
			],
			"generation-1",
			fallbackPreview,
		);

		expect(selection.patchCount).toBe(0);
		expect(selection.preview).toEqual(fallbackPreview);
	});

	it("builds inline content items for virtual table targets", () => {
		const preview = createStructuredPreview({
			plan: {
				kind: "review_bundle",
				label: "Create task table",
				reason: "Insert a task table.",
				plans: [
					{
						kind: "block_insert",
						blockId: "task-table",
						blockType: "table",
						position: "last",
					},
				],
			},
			targets: [
				{
					blockId: "task-table",
					targetKind: "table",
				} as GenerationStructuredPreviewState["targets"][number],
			],
		});

		const contentItems = buildAIStructuredPreviewContentItems(
			["intro-block"],
			preview,
		);

		expect(contentItems).toEqual([
			{ kind: "block", blockId: "intro-block" },
			{
				kind: "virtual-target",
				target: preview.targets[0],
				planState: "drafted",
			},
		]);
	});
});
