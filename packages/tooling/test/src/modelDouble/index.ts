/**
 * AIB6 model double. Import from this module.
 * Package-barrel export is deferred — `src/index.ts` is being rewritten in parallel.
 */
export { createModelDouble } from "./createModelDouble";
export type {
	ModelDouble,
	ModelDoubleEvent,
	ModelDoubleFeature,
	ModelDoubleMalformedPart,
	ModelDoubleOptions,
	ModelDoublePart,
	ModelDoubleResponse,
	ModelDoubleToolCall,
} from "./createModelDouble";
export {
	abortHalfwayGenerationParts,
	failingToolCallParts,
} from "./examples";
