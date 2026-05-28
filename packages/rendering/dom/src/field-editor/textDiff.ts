import { getLogicalTextContent } from "./inlineAtomDom";

export type TextDiffOp =
	| { type: "insert"; offset: number; text: string }
	| { type: "delete"; offset: number; length: number };

/**
 * O(n) scan from both ends to find the changed region.
 * Returns delete + insert ops for the diff.
 */
export function computeTextDiff(
	oldText: string,
	newText: string,
): TextDiffOp[] {
	if (oldText === newText) return [];

	let prefixLen = 0;
	const minLen = Math.min(oldText.length, newText.length);
	while (prefixLen < minLen && oldText[prefixLen] === newText[prefixLen]) {
		prefixLen++;
	}

	let oldSuffix = oldText.length;
	let newSuffix = newText.length;
	while (
		oldSuffix > prefixLen &&
		newSuffix > prefixLen &&
		oldText[oldSuffix - 1] === newText[newSuffix - 1]
	) {
		oldSuffix--;
		newSuffix--;
	}

	const ops: TextDiffOp[] = [];

	const deleteLen = oldSuffix - prefixLen;
	if (deleteLen > 0) {
		ops.push({ type: "delete", offset: prefixLen, length: deleteLen });
	}

	const insertText = newText.slice(prefixLen, newSuffix);
	if (insertText.length > 0) {
		ops.push({ type: "insert", offset: prefixLen, text: insertText });
	}

	return ops;
}

export function extractTextFromDOM(element: HTMLElement): string {
	return getLogicalTextContent(element);
}
