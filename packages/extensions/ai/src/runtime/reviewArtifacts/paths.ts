import type { DocumentMutationPlan } from "../planTypes";

export function selectPlanAtPath(
	plan: DocumentMutationPlan,
	bundlePath: number[],
	stepIndex: number | null,
): DocumentMutationPlan | null {
	if (bundlePath.length > 0) {
		if (plan.kind !== "review_bundle") {
			return null;
		}
		const [head, ...tail] = bundlePath;
		const nestedPlan = plan.plans[head];
		if (!nestedPlan) {
			return null;
		}
		return selectPlanAtPath(nestedPlan, tail, stepIndex);
	}

	if (stepIndex == null) {
		return plan;
	}

	if (plan.kind === "flow_patch") {
		const edit = plan.edits[stepIndex];
		return edit ? { ...plan, edits: [edit] } : null;
	}

	return null;
}

export function removePlanAtPath(
	plan: DocumentMutationPlan,
	bundlePath: number[],
	stepIndex: number | null,
): DocumentMutationPlan | null {
	if (bundlePath.length > 0) {
		if (plan.kind !== "review_bundle") {
			return null;
		}
		const [head, ...tail] = bundlePath;
		const nestedPlan = plan.plans[head];
		if (!nestedPlan) {
			return plan;
		}
		const nextNestedPlan = removePlanAtPath(nestedPlan, tail, stepIndex);
		const nextPlans = plan.plans.flatMap((entry, index) => {
			if (index !== head) {
				return [entry];
			}
			return nextNestedPlan ? [nextNestedPlan] : [];
		});
		if (nextPlans.length === 0) {
			return null;
		}
		if (nextPlans.length === 1) {
			return nextPlans[0] ?? null;
		}
		return { ...plan, plans: nextPlans };
	}

	if (stepIndex == null) {
		return null;
	}

	if (plan.kind === "flow_patch") {
		const nextEdits = plan.edits.filter((_, index) => index !== stepIndex);
		return nextEdits.length > 0 ? { ...plan, edits: nextEdits } : null;
	}

	return null;
}
