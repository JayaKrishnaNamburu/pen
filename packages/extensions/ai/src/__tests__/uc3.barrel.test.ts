import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as barrel from "../index";

/**
 * UC3: the planner is absent from the public API surface.
 *
 * A behavioral test cannot see a type export, and `uc3.planReachability`
 * covers behavior anyway. This one guards the surface: the names a host could
 * still build a second edit channel against (`spec-v5/01-channel.md` UC3).
 */

const AI_PACKAGE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * `plan` alone would catch `StreamingPreviewPlanResult` and other live preview
 * internals, so the population is the planner's own vocabulary.
 */
const PLANNER_NAMES = [
	"structuredPlanner",
	"planValidation",
	"planExecutor",
	"plannerMode",
	"AIPlannerMode",
	"AI_PLANNER_MODES",
	"DocumentMutationPlan",
	"DOCUMENT_MUTATION_PLAN_KINDS",
	"PLAN_VALIDATION_SEVERITIES",
	"validateDocumentMutationPlanShape",
	"isDocumentMutationPlan",
	"PlanValidation",
	"GenerationPlanState",
	"StructuralReviewItem",
	"FlowPatchAlignmentMetrics",
	"buildDocumentMutationPlanExecution",
	"reconcilePlannerModeWithPrompt",
];

const STRANDED_INTENT_TRANSPORT_NAMES = [
	"buildStructuredIntentModelPrompt",
	"getStructuredIntentOutputSchema",
	"parseStructuredIntentRequestPrompt",
];

describe("UC3: planner symbols are absent from the public API", () => {
	it("UC3: the runtime barrel exports no planner value", () => {
		const exported = Object.keys(barrel);
		// A closed-set check over nothing proves nothing.
		expect(exported.length).toBeGreaterThan(0);

		const offenders = exported.filter((name) =>
			[...PLANNER_NAMES, ...STRANDED_INTENT_TRANSPORT_NAMES].some(
				(blocked) => name.includes(blocked),
			),
		);
		expect(offenders, "planner values are still exported").toEqual([]);
	});

	it("UC3: the barrel source re-exports no planner type or module", () => {
		const source = readFileSync(
			join(AI_PACKAGE, "src", "index.ts"),
			"utf8",
		);
		const offenders = [
			...PLANNER_NAMES,
			...STRANDED_INTENT_TRANSPORT_NAMES,
		].filter((name) => source.includes(name));
		expect(
			offenders,
			"the barrel still names the planner (types are invisible at runtime, so this reads the source)",
		).toEqual([]);
	});

	it("UC3: the recorded API report names no planner symbol", () => {
		// The report is the artifact a consumer diffs across releases, so a
		// symbol that left the barrel but stayed here is still a promise.
		const report = readFileSync(join(AI_PACKAGE, "api-report.md"), "utf8");
		expect(report.length).toBeGreaterThan(0);

		const offenders = [
			...PLANNER_NAMES,
			...STRANDED_INTENT_TRANSPORT_NAMES,
		].filter((name) => report.includes(name));
		expect(offenders, "api-report.md still lists planner symbols").toEqual(
			[],
		);
	});
});
