import type { AIWorkingSetEnvelope } from "../../types";
import type { AITargetKind } from "../contracts";
import type { DocumentMutationPlan } from "../planTypes";
import type { PlanValidationIssue } from "../planValidation";

export interface StructuredPlannerConfig {
	prompt: string;
	targetKind: AITargetKind;
	workingSet: AIWorkingSetEnvelope | null;
}

export interface StructuredPlannerParseResult {
	plan: DocumentMutationPlan | null;
	planState: "drafted" | "validated" | "rejected";
	issues: PlanValidationIssue[];
}
