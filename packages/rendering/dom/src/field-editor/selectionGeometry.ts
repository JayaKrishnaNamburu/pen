import {
	findLogicalDOMPoint,
	getInlineAtomPointerOffset,
	getLogicalNodeLength,
} from "./inlineAtomDom";

const WRAPPED_LINE_HYSTERESIS_PX = 6;
const WRAPPED_LINE_HORIZONTAL_SLACK_PX = 12;
const WRAPPED_LINE_DELTA_PX = 1;

export function getDistanceToRect(
	rect: DOMRect,
	clientX: number,
	clientY: number,
): { dx: number; dy: number } {
	return {
		dx:
			clientX < rect.left
				? rect.left - clientX
				: clientX > rect.right
					? clientX - rect.right
					: 0,
		dy:
			clientY < rect.top
				? rect.top - clientY
				: clientY > rect.bottom
					? clientY - rect.bottom
					: 0,
	};
}

function getCharacterRectAtOffset(
	container: HTMLElement,
	charOffset: number,
): DOMRect | null {
	const domPoint = findLogicalDOMPoint(container, charOffset);
	const range = document.createRange();
	try {
		range.setStart(domPoint.node, domPoint.offset);
		range.setEnd(domPoint.node, domPoint.offset);
	} catch {
		return null;
	}
	const rangeRectGetter = (
		range as Range & { getBoundingClientRect?: () => DOMRect }
	).getBoundingClientRect;
	if (typeof rangeRectGetter === "function") {
		const rect = rangeRectGetter.call(range);
		if (rect.width > 0 || rect.height > 0) {
			return rect;
		}
	}

	return null;
}

export function getInlineCaretRectFromOffset(
	inlineEl: HTMLElement,
	offset: number,
): DOMRect {
	const textLength = getLogicalNodeLength(inlineEl);
	const inlineRect = inlineEl.getBoundingClientRect();
	if (textLength <= 0) {
		return {
			x: inlineRect.left,
			y: inlineRect.top,
			left: inlineRect.left,
			top: inlineRect.top,
			right: inlineRect.left,
			bottom: inlineRect.bottom,
			width: 0,
			height: inlineRect.height,
			toJSON() {
				return {};
			},
		} as DOMRect;
	}

	if (offset <= 0) {
		const firstRect = getCharacterRectAtOffset(inlineEl, 0);
		const left = firstRect?.left ?? inlineRect.left;
		const top = firstRect?.top ?? inlineRect.top;
		const height = firstRect?.height ?? inlineRect.height;
		return {
			x: left,
			y: top,
			left,
			top,
			right: left,
			bottom: top + height,
			width: 0,
			height,
			toJSON() {
				return {};
			},
		} as DOMRect;
	}

	if (offset >= textLength) {
		const lastRect = getCharacterRectAtOffset(inlineEl, textLength - 1);
		const left = lastRect?.right ?? inlineRect.right;
		const top = lastRect?.top ?? inlineRect.top;
		const height = lastRect?.height ?? inlineRect.height;
		return {
			x: left,
			y: top,
			left,
			top,
			right: left,
			bottom: top + height,
			width: 0,
			height,
			toJSON() {
				return {};
			},
		} as DOMRect;
	}

	const previousRect = getCharacterRectAtOffset(inlineEl, offset - 1);
	const nextRect = getCharacterRectAtOffset(inlineEl, offset);
	const useNextRect =
		previousRect && nextRect && nextRect.top > previousRect.top + 1;
	const sourceRect = useNextRect
		? nextRect
		: (previousRect ?? nextRect ?? inlineRect);
	const left = useNextRect
		? (nextRect?.left ?? inlineRect.left)
		: (previousRect?.right ?? nextRect?.left ?? inlineRect.left);

	return {
		x: left,
		y: sourceRect.top,
		left,
		top: sourceRect.top,
		right: left,
		bottom: sourceRect.top + sourceRect.height,
		width: 0,
		height: sourceRect.height,
		toJSON() {
			return {};
		},
	} as DOMRect;
}

function getCaretDistanceMetrics(
	rect: DOMRect,
	clientX: number,
	clientY: number,
): {
	dx: number;
	dy: number;
} {
	return {
		dx: Math.abs(clientX - rect.left),
		dy:
			clientY < rect.top
				? rect.top - clientY
				: clientY > rect.bottom
					? clientY - rect.bottom
					: 0,
	};
}

function stabilizeWrappedLineOffset(
	inlineEl: HTMLElement,
	candidateOffset: number,
	clientX: number,
	clientY: number,
	previousOffset: number | null | undefined,
): number {
	if (previousOffset == null || previousOffset === candidateOffset) {
		return candidateOffset;
	}

	const previousRect = getInlineCaretRectFromOffset(inlineEl, previousOffset);
	const candidateRect = getInlineCaretRectFromOffset(
		inlineEl,
		candidateOffset,
	);
	if (
		Math.abs(previousRect.top - candidateRect.top) <= WRAPPED_LINE_DELTA_PX
	) {
		return candidateOffset;
	}

	const previousMetrics = getCaretDistanceMetrics(
		previousRect,
		clientX,
		clientY,
	);
	const candidateMetrics = getCaretDistanceMetrics(
		candidateRect,
		clientX,
		clientY,
	);
	const isNearWrappedBoundary =
		previousMetrics.dy <= WRAPPED_LINE_HYSTERESIS_PX &&
		candidateMetrics.dy <= WRAPPED_LINE_HYSTERESIS_PX;
	if (!isNearWrappedBoundary) {
		return candidateOffset;
	}

	const shouldPreservePreviousLine =
		previousMetrics.dx <=
			candidateMetrics.dx + WRAPPED_LINE_HORIZONTAL_SLACK_PX &&
		previousMetrics.dy <= candidateMetrics.dy + WRAPPED_LINE_DELTA_PX;
	return shouldPreservePreviousLine ? previousOffset : candidateOffset;
}

export function approximateInlineOffsetFromPoint(
	inlineEl: HTMLElement,
	clientX: number,
	clientY: number,
	previousOffset?: number | null,
): number {
	const textLength = getLogicalNodeLength(inlineEl);
	if (textLength <= 0) return 0;
	const inlineAtomOffset = getInlineAtomPointerOffset(
		inlineEl,
		clientX,
		clientY,
	);
	if (inlineAtomOffset !== null) {
		return inlineAtomOffset;
	}

	let bestOffset = 0;
	let bestScore = Number.POSITIVE_INFINITY;

	for (let offset = 0; offset <= textLength; offset++) {
		const rect = getInlineCaretRectFromOffset(inlineEl, offset);
		const { dx, dy } = getCaretDistanceMetrics(rect, clientX, clientY);
		const score = dy * 1000 + dx;
		if (score < bestScore) {
			bestScore = score;
			bestOffset = offset;
		}
	}

	return stabilizeWrappedLineOffset(
		inlineEl,
		bestOffset,
		clientX,
		clientY,
		previousOffset,
	);
}
