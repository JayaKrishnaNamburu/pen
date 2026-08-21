// getAIToolRuntime is the host accessor. The slot key is
// DOCUMENT_OPS_TOOL_RUNTIME_SLOT on @input/pen-document-ops.
export { getAIToolRuntime } from "./toolServer";
export { AIToolContextImpl, AIToolRuntimeImpl } from "./toolServer";
export { toAIToolDescriptor, listAITools } from "./descriptors";
export { executeAITool, openAIToolCall } from "./execution";
export type { OpenAIToolCall } from "./execution";
export {
	AI_AGENTIC_MAX_STEPS_DEFAULT,
	AI_DESTRUCTIVE_TOOL_NAMES,
	AI_MUTATING_TOOL_NAMES,
	AI_READ_ONLY_TOOL_NAMES,
	AI_TOOL_MAX_CALLS_PER_TURN,
	AI_TOOL_MAX_OPS_PER_CALL,
	AI_TOOL_MAX_TOTAL_OPS_PER_TURN,
	AI_TOOL_READ_ONLY_MUTATION_CODE,
	AI_TOOL_UNCONFIRMED_CODE,
} from "./constants";
export {
	authorizeAIToolCall,
	createAIToolTurn,
	isAIToolCallDenied,
	isDestructiveAITool,
	isMutatingAITool,
} from "./authority";
export { collectToolExecutionOutput as collectAIToolOutput } from "@input/pen-core";
export type { AIToolDescriptor, AIToolRuntime } from "./types";
export type {
	AIToolAuthorityReason,
	AIToolAuthorization,
	AIToolBudgetLimits,
	AIToolCallDenied,
	AIToolCallStatus,
	AIToolConfirmFn,
	AIToolConfirmationDecision,
	AIToolConfirmationRequest,
	AIToolGrant,
	AIToolTurn,
	AIToolTurnOptions,
} from "./authority";
