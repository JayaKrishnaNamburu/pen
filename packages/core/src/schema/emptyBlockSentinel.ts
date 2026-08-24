import type { DiagnosticEvent } from "@input/pen-types";

import type { CRDTTextLike } from "../editor/crdtShapes";

/**
 * I14 / EM4: the only production module that may name this character.
 * Stamp-2 stored the lone-zwsp form as a caret target. Wave 5 heals
 * that exact form to "". Embedded copies in longer text are user content.
 */
const LONE_EMPTY_BLOCK_ZWSP = "\u200B";

export function isLoneEmptyBlockZwsp(text: string): boolean {
	return text === LONE_EMPTY_BLOCK_ZWSP;
}

export function stripForeignSentinel(
	content: CRDTTextLike,
	blockId: string,
	onDiagnostic?: (event: DiagnosticEvent) => void,
): boolean {
	if (content.length !== 1 || !isLoneEmptyBlockZwsp(content.toString())) {
		return false;
	}
	content.delete(0, 1);
	onDiagnostic?.({
		code: "sentinel-stripped",
		level: "info",
		source: "schema",
		message: `Stripped lone empty-block zwsp from "${blockId}".`,
		remediation:
			"Empty text-capable blocks store the empty string. This heal is Wave 5 scaffolding for stamp-2 remotes.",
		blockId,
	});
	return true;
}
