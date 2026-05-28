// @ts-nocheck
import { decorationControllerMethods } from "./controllers/decorationControllerMethods";
import { generationRunnerMethods } from "./controllers/generationRunnerMethods";
import { suggestionControllerMethods } from "./controllers/suggestionControllerMethods";

export const aiControllerMethodsPart4 = {
	...generationRunnerMethods,
	...decorationControllerMethods,
	...suggestionControllerMethods,
};
