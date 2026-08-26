import { describe, expect, it } from "vitest";
import type { SelectionState } from "@input/pen-types";
import type { AISurface } from "../types";
import {
	AI_MUTATION_MODES,
	AI_ROUTE_LANES,
	AI_TARGET_KINDS,
	type AIContentFormat,
	type AIMutationPreference,
} from "../runtime/contracts";
import {
	refineRouteWithNavigator,
	routeAIRequest,
	type RequestRouterDecision,
	type RequestRouterInput,
} from "../runtime/router";

/**
 * UC5: the route vocabulary keeps only unions whose every member has a
 * producer.
 *
 * Two claims over one corpus. First, that routing is a function: the same input
 * resolves to exactly one route, so no caller has to reconcile two answers.
 * Second, that every member of every union the decision carries is reachable —
 * a member no input can produce is a branch consumers must handle and no
 * producer can exercise, which is what the fold removed.
 *
 * The corpus is the cross product rather than a hand-picked list, because a
 * hand-picked list proves coverage of the cases someone thought of, and the
 * unreachable member is by definition the one nobody thought of.
 */

const PROMPTS = [
	"Rewrite this paragraph",
	"Continue this paragraph",
	"Make the title purple",
	"Turn these lines into a bulleted list",
	"Find every mention of revenue",
	"Review the whole document",
	"What does this paragraph say?",
	"Sea shanty",
];

const SURFACES: Array<AISurface | undefined> = [
	undefined,
	"inline-edit",
	"bottom-chat",
];
const SELECTIONS: SelectionState[] = [
	null,
	textSelection(2, 2),
	textSelection(0, 12),
];

function textSelection(from: number, to: number): SelectionState {
	return {
		type: "text",
		anchor: { blockId: "b1", offset: from },
		focus: { blockId: "b1", offset: to },
	};
}
const BLOCK_TYPES = ["paragraph", "heading", "table"];
const CONTENT_FORMATS: AIContentFormat[] = ["text", "markdown"];
const MUTATION_PREFERENCES: Array<AIMutationPreference | undefined> = [
	undefined,
	"suggestions",
	"direct",
];

function corpus(): RequestRouterInput[] {
	const inputs: RequestRouterInput[] = [];
	for (const prompt of PROMPTS) {
		for (const surface of SURFACES) {
			for (const selection of SELECTIONS) {
				for (const blockType of BLOCK_TYPES) {
					for (const contentFormat of CONTENT_FORMATS) {
						for (const mutationPreference of MUTATION_PREFERENCES) {
							for (const target of [
								"selection",
								"block",
							] as const) {
								for (const suggestMode of [false, true]) {
									inputs.push({
										prompt,
										selection,
										blockType,
										blockCount: 20,
										suggestMode,
										target,
										contentFormat,
										surface,
										mutationPreference,
									});
								}
							}
						}
					}
				}
			}
		}
	}
	return inputs;
}

/** Every route the corpus reaches, including the navigator's refinements. */
function decisions(): RequestRouterDecision[] {
	const routed: RequestRouterDecision[] = [];
	for (const input of corpus()) {
		const decision = routeAIRequest(input);
		routed.push(decision);
		for (const activeBlockType of [null, "paragraph", "table"]) {
			routed.push(
				refineRouteWithNavigator(decision, {
					activeBlockType,
					selectedTextLength: 0,
				}),
				refineRouteWithNavigator(decision, {
					activeBlockType,
					selectedTextLength: 2000,
					structuredTargetKind: "table",
				}),
			);
		}
	}
	return routed;
}

describe("UC5: the route vocabulary folds to members with producers", () => {
	it("UC5: every input resolves to exactly one route", () => {
		for (const input of corpus()) {
			const first = routeAIRequest(input);
			const second = routeAIRequest(input);
			expect(second).toEqual(first);
			expect(AI_ROUTE_LANES).toContain(first.lane);
		}
	});

	it("UC5: refinement is a fixed point, so a route settles on one answer", () => {
		for (const input of corpus()) {
			const refinement = {
				activeBlockType: input.blockType,
				selectedTextLength: 0,
			};
			const once = refineRouteWithNavigator(
				routeAIRequest(input),
				refinement,
			);
			expect(refineRouteWithNavigator(once, refinement)).toEqual(once);
		}
	});

	const produced = () => {
		const routed = decisions();
		return {
			lane: new Set(routed.map((route) => route.lane)),
			mutationMode: new Set(routed.map((route) => route.mutationMode)),
			targetKind: new Set(routed.map((route) => route.targetKind)),
			editsArriveAsToolCalls: new Set(
				routed.map((route) => route.editsArriveAsToolCalls),
			),
		};
	};

	const coverage: Array<{
		field: keyof ReturnType<typeof produced>;
		declared: readonly unknown[];
	}> = [
		{ field: "lane", declared: AI_ROUTE_LANES },
		{ field: "mutationMode", declared: AI_MUTATION_MODES },
		{ field: "targetKind", declared: AI_TARGET_KINDS },
		{ field: "editsArriveAsToolCalls", declared: [false, true] },
	];

	const reached = produced();
	for (const { field, declared } of coverage) {
		it(`UC5: every ${field} member has a producer`, () => {
			expect(
				[...declared].filter(
					(member) => !reached[field].has(member as never),
				),
			).toEqual([]);
		});

		it(`UC5: no ${field} value escapes the declared union`, () => {
			expect(
				[...reached[field]].filter(
					(member) => !declared.includes(member),
				),
			).toEqual([]);
		});
	}

	/*
	 * UC5's deletions, asserted by name so a re-introduction is a failing test
	 * rather than a quiet re-export. `AIApplyStrategy` was a restatement of
	 * `target` and `contentFormat` plus one bit the decision now carries as
	 * `editsArriveAsToolCalls`; `AIPlannerMode` selected the text-parsed plan
	 * channel UC3 deleted.
	 */
	it("UC5: the folded vocabularies are gone from the route contracts", async () => {
		const contracts: Record<string, unknown> =
			await import("../runtime/contracts");
		for (const name of [
			"AI_APPLY_STRATEGIES",
			"AIApplyStrategy",
			"AI_PLANNER_MODES",
			"AIPlannerMode",
			"AI_BLOCK_ADAPTER_IDS",
			"AI_BLOCK_CLASSES",
			"AI_TRANSPORT_KINDS",
			"AI_EXECUTION_MODES",
		]) {
			expect(Object.keys(contracts)).not.toContain(name);
		}
	});
});
