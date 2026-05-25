// @ts-nocheck
import { executeLocalOperation } from "./localOperationExecution";
import type { AIRequestedOperation, GenerationState } from "../types";
import type { GenerationExecutionContext, GenerationTarget } from "./extensionHelpers";

export const aiControllerMethodsPart5 = {
	async _executeLocalOperation(this: any, input: {
		prompt: string;
		target: GenerationTarget;
		blockId: string;
		commandId?: string;
		context?: GenerationExecutionContext;
		abortController: AbortController;
		baselineSuggestionIds: Set<string>;
		operation: AIRequestedOperation;
	}): Promise<GenerationState> {
		return executeLocalOperation(this, input);
	},
};
