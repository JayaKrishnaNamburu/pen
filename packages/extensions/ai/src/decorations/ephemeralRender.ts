import type { Decoration } from "@input/pen-types";
import { EphemeralSuggestionManager } from "../suggestions/ephemeral";

export function buildEphemeralDecorations(
	manager: EphemeralSuggestionManager,
): Decoration[] {
	return manager.toDecorations();
}
