export function countSharedPrefixLength(left: string, right: string): number {
	let index = 0;
	while (index < left.length && index < right.length && left[index] === right[index]) {
		index += 1;
	}
	return index;
}

export function countSharedSuffixLength(left: string, right: string): number {
	let count = 0;
	while (
		count < left.length &&
		count < right.length &&
		left[left.length - count - 1] === right[right.length - count - 1]
	) {
		count += 1;
	}
	return count;
}

export function findStreamingPreviewResyncAnchor(
	originalTail: string,
	replacementTail: string,
): { originalOffset: number; replacementOffset: number } | null {
	for (
		let replacementOffset = 0;
		replacementOffset < replacementTail.length;
		replacementOffset += 1
	) {
		const candidate = replacementTail.slice(replacementOffset);
		if (candidate.trim().length < 3) {
			continue;
		}
		const originalOffset = originalTail.indexOf(candidate);
		if (originalOffset >= 0) {
			return { originalOffset, replacementOffset };
		}
	}

	return null;
}

export function hasLineBreak(text: string): boolean {
	return /[\r\n]/.test(text);
}
