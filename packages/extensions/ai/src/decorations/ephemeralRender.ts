import type { Decoration } from "@pen/core";
import { EphemeralSuggestionManager } from "../suggestions/ephemeral";

export function buildEphemeralDecorations(
	manager: EphemeralSuggestionManager,
): Decoration[] {
	return manager.toDecorations();
}
