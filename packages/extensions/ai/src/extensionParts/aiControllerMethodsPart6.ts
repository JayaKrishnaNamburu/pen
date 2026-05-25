// @ts-nocheck
import { executeGeneration } from "./generationExecution";
import type { GenerationState } from "../types";
import type { GenerationExecutionContext, GenerationTarget } from "./extensionHelpers";

export const aiControllerMethodsPart6 = {
	async _executeGeneration(
		this: any,
		prompt: string,
		target: GenerationTarget,
		commandId?: string,
		maxSteps?: number,
		context?: GenerationExecutionContext,
	): Promise<GenerationState> {
		return executeGeneration(this, {
			prompt,
			target,
			commandId,
			maxSteps,
			context,
		});
	},
};
