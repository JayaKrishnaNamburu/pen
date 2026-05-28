import type { Editor } from "@pen/types";
import type { FieldEditorDelta } from "./crdt";
import { domPointToOffset, getSelectionOffsets } from "./selectionBridge";

export function requiresResolvedInputRange(inputType: string): boolean {
	return (
		inputType === "insertText" ||
		inputType === "insertReplacementText" ||
		inputType === "deleteContentBackward" ||
		inputType === "deleteContentForward" ||
		inputType === "deleteByCut" ||
		inputType === "deleteWordBackward" ||
		inputType === "deleteWordForward" ||
		inputType === "insertLineBreak"
	);
}

export function canResolveInputRange(
	event: InputEvent,
	element: HTMLElement,
): boolean {
	if (event.inputType === "insertReplacementText") {
		const targetRanges = event.getTargetRanges?.();
		if (targetRanges?.length) {
			return staticRangeToOffsets(targetRanges[0], element) !== null;
		}
	}

	return getSelectionOffsets(element) !== null;
}

/**
 * Convert a StaticRange (from getTargetRanges) to character offsets
 * within the inline content element.
 */
export function staticRangeToOffsets(
	staticRange: StaticRange,
	element: HTMLElement,
): { start: number; end: number } | null {
	if (
		(staticRange.startContainer !== element &&
			!element.contains(staticRange.startContainer)) ||
		(staticRange.endContainer !== element &&
			!element.contains(staticRange.endContainer))
	) {
		return null;
	}

	const startOffset = domPointToOffset(
		element,
		staticRange.startContainer,
		staticRange.startOffset,
	);
	const endOffset = domPointToOffset(
		element,
		staticRange.endContainer,
		staticRange.endOffset,
	);

	return {
		start: Math.min(startOffset, endOffset),
		end: Math.max(startOffset, endOffset),
	};
}

export function setSelectionOffsets(
	element: HTMLElement,
	startOffset: number,
	endOffset: number,
): void {
	const selection = element.ownerDocument?.getSelection();
	if (!selection) return;

	const startPoint = resolveDomPointForOffset(element, startOffset);
	const endPoint = resolveDomPointForOffset(element, endOffset);
	if (!startPoint || !endPoint) return;

	selection.removeAllRanges();

	const setBaseAndExtent = (
		selection as Selection & {
			setBaseAndExtent?: (
				anchorNode: Node,
				anchorOffset: number,
				focusNode: Node,
				focusOffset: number,
			) => void;
		}
	).setBaseAndExtent;
	if (typeof setBaseAndExtent === "function") {
		try {
			setBaseAndExtent.call(
				selection,
				startPoint.node,
				startPoint.offset,
				endPoint.node,
				endPoint.offset,
			);
			return;
		} catch {
			// Fall back to the range-based path in non-browser test environments.
		}
	}

	const collapseRange = element.ownerDocument.createRange();
	collapseRange.setStart(startPoint.node, startPoint.offset);
	collapseRange.collapse(true);
	selection.addRange(collapseRange);

	if (
		(startPoint.node !== endPoint.node ||
			startPoint.offset !== endPoint.offset) &&
		typeof selection.extend === "function"
	) {
		selection.extend(endPoint.node, endPoint.offset);
		return;
	}

	selection.removeAllRanges();
	const range = element.ownerDocument.createRange();
	range.setStart(startPoint.node, startPoint.offset);
	range.setEnd(endPoint.node, endPoint.offset);
	selection.addRange(range);
}

function resolveDomPointForOffset(
	element: HTMLElement,
	targetOffset: number,
): { node: Node; offset: number } | null {
	const walker = element.ownerDocument.createTreeWalker(
		element,
		NodeFilter.SHOW_TEXT,
		null,
	);
	let remaining = Math.max(0, targetOffset);
	let textNode = walker.nextNode() as Text | null;

	while (textNode) {
		const length = textNode.textContent?.length ?? 0;
		if (remaining <= length) {
			return { node: textNode, offset: remaining };
		}
		remaining -= length;
		textNode = walker.nextNode() as Text | null;
	}

	if (element.lastChild) {
		if (element.lastChild.nodeType === Node.TEXT_NODE) {
			const textLength = element.lastChild.textContent?.length ?? 0;
			return {
				node: element.lastChild,
				offset: textLength,
			};
		}
		const childCount = element.lastChild.childNodes.length;
		return { node: element.lastChild, offset: childCount };
	}

	return { node: element, offset: 0 };
}

export function rebaseTextDiffOps(
	ops: Array<
		| { type: "insert"; offset: number; text: string }
		| { type: "delete"; offset: number; length: number }
	>,
	deferredRemoteDeltas: Array<{ delta: FieldEditorDelta[] }>,
): Array<
	| { type: "insert"; offset: number; text: string }
	| { type: "delete"; offset: number; length: number }
> {
	if (deferredRemoteDeltas.length === 0 || ops.length === 0) {
		return ops;
	}

	return ops
		.map((op) => {
			if (op.type === "insert") {
				return {
					type: "insert" as const,
					offset: mapOffsetThroughRemoteDeltas(
						op.offset,
						deferredRemoteDeltas,
					),
					text: op.text,
				};
			}

			const start = mapOffsetThroughRemoteDeltas(
				op.offset,
				deferredRemoteDeltas,
			);
			const end = mapOffsetThroughRemoteDeltas(
				op.offset + op.length,
				deferredRemoteDeltas,
			);
			return {
				type: "delete" as const,
				offset: start,
				length: Math.max(0, end - start),
			};
		})
		.filter((op) => {
			if (op.type === "insert") {
				return true;
			}
			return op.length > 0;
		});
}

function mapOffsetThroughRemoteDeltas(
	originalOffset: number,
	deferredRemoteDeltas: Array<{ delta: FieldEditorDelta[] }>,
): number {
	let mappedOffset = originalOffset;

	for (const { delta } of deferredRemoteDeltas) {
		let cursor = 0;
		for (const part of delta) {
			if (part.retain != null) {
				cursor += part.retain;
				continue;
			}

			if (part.delete != null) {
				if (cursor < mappedOffset) {
					const deletedBeforeOffset = Math.min(
						part.delete,
						mappedOffset - cursor,
					);
					mappedOffset -= deletedBeforeOffset;
				}
				continue;
			}

			if (part.insert != null) {
				const insertedLength =
					typeof part.insert === "string" ? part.insert.length : 1;
				if (cursor <= mappedOffset) {
					mappedOffset += insertedLength;
				}
				cursor += insertedLength;
			}
		}
	}

	return mappedOffset;
}

export function isNavigationSelectionKey(event: KeyboardEvent): boolean {
	return (
		event.key === "ArrowLeft" ||
		event.key === "ArrowRight" ||
		event.key === "ArrowUp" ||
		event.key === "ArrowDown" ||
		event.key === "Home" ||
		event.key === "End" ||
		event.key === "PageUp" ||
		event.key === "PageDown"
	);
}
