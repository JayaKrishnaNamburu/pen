import type {
	GeometryAffinity,
	GeometryCaretCompare,
	GeometryPoint,
	GeometryPointRef,
	GeometryRect,
} from "../../src/types";

export function serializeRect(rect: {
	x: number;
	y: number;
	width: number;
	height: number;
	top: number;
	left: number;
	right: number;
	bottom: number;
} | null): GeometryRect | null {
	if (!rect) {
		return null;
	}
	return {
		x: rect.x,
		y: rect.y,
		width: rect.width,
		height: rect.height,
		top: rect.top,
		left: rect.left,
		right: rect.right,
		bottom: rect.bottom,
	};
}

export function rectsEqual(
	left: GeometryRect | null,
	right: GeometryRect | null,
): boolean {
	if (left == null || right == null) {
		return left === right;
	}
	return (
		Object.is(left.x, right.x) &&
		Object.is(left.y, right.y) &&
		Object.is(left.width, right.width) &&
		Object.is(left.height, right.height) &&
		Object.is(left.top, right.top) &&
		Object.is(left.left, right.left) &&
		Object.is(left.right, right.right) &&
		Object.is(left.bottom, right.bottom)
	);
}

export function normalizePoint(point: GeometryPointRef): {
	point: GeometryPoint;
	affinity: GeometryAffinity;
} {
	return {
		point: { blockId: point.blockId, offset: point.offset },
		affinity: point.affinity ?? "downstream",
	};
}

export function tallyCaretCompares(compares: readonly GeometryCaretCompare[]): {
	staleCount: number;
	missingCount: number;
} {
	return {
		staleCount: compares.filter((entry) => entry.stale).length,
		missingCount: compares.filter(
			(entry) => entry.cached == null || entry.fromScratch == null,
		).length,
	};
}

export function caretCacheHolds(result: {
	staleCount: number;
	missingCount: number;
}): boolean {
	return result.staleCount === 0 && result.missingCount === 0;
}

export function geometryBlocksFromEditor(editor: {
	documentState: { blockOrder: readonly string[] };
	getBlock: (id: string) => { length: () => number } | null | undefined;
}): { id: string; length: number }[] {
	return editor.documentState.blockOrder.map((id) => ({
		id,
		length: editor.getBlock(id)?.length() ?? 0,
	}));
}
