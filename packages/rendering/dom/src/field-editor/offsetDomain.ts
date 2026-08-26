export function logicalLength(text: string): number {
	return text.length;
}

function clampToLogical(offset: number, text: string): number {
	const length = logicalLength(text);
	if (offset <= 0) {
		return 0;
	}
	if (offset >= length) {
		return length;
	}
	return offset;
}

export function toDomOffset(logicalOffset: number, text: string): number {
	return clampToLogical(logicalOffset, text);
}

export function toLogicalOffset(domOffset: number, text: string): number {
	return clampToLogical(domOffset, text);
}
