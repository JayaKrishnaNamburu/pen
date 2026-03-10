import type { SelectionRange } from "../field-editor/commands";

export interface ListInputRuleMatch {
	blockType: "bulletListItem" | "numberedListItem" | "checkListItem";
	deleteRange: SelectionRange;
	newProps?: Record<string, unknown>;
}

export function matchListInputRule(
	blockText: string,
	range: SelectionRange,
	insertedText: string,
): ListInputRuleMatch | null {
	if (range.start !== range.end) {
		return null;
	}

	if (!insertedText.endsWith(" ")) {
		return null;
	}

	const nextText =
		blockText.slice(0, range.start) +
		insertedText +
		blockText.slice(range.end);

	if (/^[-*+] $/.test(nextText)) {
		return {
			blockType: "bulletListItem",
			deleteRange: { start: 0, end: nextText.length },
		};
	}

	const numberedMatch = nextText.match(/^(\d+)\. $/);
	if (numberedMatch) {
		const start = Number.parseInt(numberedMatch[1] ?? "1", 10);
		return {
			blockType: "numberedListItem",
			deleteRange: { start: 0, end: nextText.length },
			newProps: start > 1 ? { start } : undefined,
		};
	}

	if (nextText === "[] " || nextText === "[ ] ") {
		return {
			blockType: "checkListItem",
			deleteRange: { start: 0, end: nextText.length },
		};
	}

	return null;
}
