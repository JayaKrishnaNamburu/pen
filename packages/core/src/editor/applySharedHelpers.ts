import type { CRDTArray, DocumentOp, Position } from "@input/pen-types";
import {
	type CRDTInlineTextLike,
	type CRDTTextLike,
	type CRDTUnknownArray,
	type CRDTUnknownMap,
	getArrayProp,
	getMapProp,
} from "./crdtShapes";
import type { ApplyPipelineDocumentAccess } from "./applyPipelineContext";

type MutableMap = CRDTUnknownMap & { delete(key: string): void };
type MutableStringArray = CRDTUnknownArray<string>;

export function blockExists(
	pipeline: Pick<ApplyPipelineDocumentAccess, "blocks">,
	blockId: string,
): boolean {
	return pipeline.blocks.has(blockId);
}

export function createMutableMap(
	pipeline: Pick<ApplyPipelineDocumentAccess, "_adapter">,
): MutableMap {
	return pipeline._adapter.createMap() as MutableMap;
}

export function getMutableBlockMap(
	pipeline: Pick<ApplyPipelineDocumentAccess, "blocks">,
	blockId: string,
): MutableMap | null {
	return (
		(pipeline.blocks.get(blockId) as unknown as MutableMap | undefined) ?? null
	);
}

export function getMutableAppMap(
	pipeline: Pick<ApplyPipelineDocumentAccess, "apps">,
	appId: string,
): MutableMap | null {
	return (pipeline.apps.get(appId) as unknown as MutableMap | undefined) ?? null;
}

export function getOrCreateMapProp(
	pipeline: Pick<ApplyPipelineDocumentAccess, "_adapter">,
	container: CRDTUnknownMap,
	key: string,
): MutableMap {
	const existing = getMapProp(container, key);
	if (existing) {
		return existing as MutableMap;
	}
	const map = createMutableMap(pipeline);
	container.set(key, map);
	return map;
}

export function getOrCreateStringArrayProp(
	pipeline: Pick<ApplyPipelineDocumentAccess, "_adapter">,
	container: CRDTUnknownMap,
	key: string,
): MutableStringArray {
	const existing = getArrayProp<string>(container, key);
	if (existing) {
		return existing as MutableStringArray;
	}
	const array = pipeline._adapter.createArray() as MutableStringArray;
	container.set(key, array);
	return array;
}

export function removeBlockIdFromArray(
	array: MutableStringArray,
	blockId: string,
	stopAfterFirst = false,
): void {
	for (let index = array.length - 1; index >= 0; index--) {
		if (array.get(index) !== blockId) {
			continue;
		}
		array.delete(index, 1);
		if (stopAfterFirst) {
			return;
		}
	}
}

export function removeBlockIdFromAllChildren(
	pipeline: Pick<ApplyPipelineDocumentAccess, "blocks">,
	blockId: string,
): void {
	for (const [, parentMap] of pipeline.blocks.entries()) {
		const children = getArrayProp<string>(
			parentMap as unknown as CRDTUnknownMap,
			"children",
		);
		if (!children) {
			continue;
		}
		removeBlockIdFromArray(children as MutableStringArray, blockId);
	}
}

export function getTextContent(
	_pipeline: Pick<ApplyPipelineDocumentAccess, "blocks">,
	blockMap: CRDTUnknownMap,
): CRDTTextLike | undefined {
	const content = blockMap.get("content");
	return content &&
		typeof content === "object" &&
		typeof (content as { insert?: unknown }).insert === "function" &&
		typeof (content as { delete?: unknown }).delete === "function" &&
		typeof (content as { format?: unknown }).format === "function" &&
		typeof (content as { toDelta?: unknown }).toDelta === "function" &&
		typeof (content as { toString?: unknown }).toString === "function" &&
		typeof (content as { length?: unknown }).length === "number"
		? (content as CRDTTextLike)
		: undefined;
}

export function getInlineTextContent(
	pipeline: Pick<ApplyPipelineDocumentAccess, "blocks">,
	blockMap: CRDTUnknownMap,
): CRDTInlineTextLike | undefined {
	const content = getTextContent(pipeline, blockMap);
	return content &&
		typeof (content as { insertEmbed?: unknown }).insertEmbed === "function"
		? (content as CRDTInlineTextLike)
		: undefined;
}

export function resolvePosition(
	pipeline: Pick<ApplyPipelineDocumentAccess, "_doc" | "blocks">,
	position: Position,
): number {
	const blockOrder = pipeline._doc.blockOrder;

	if (position === "first") return 0;
	if (position === "last") return blockOrder.length;

	if (typeof position === "object" && "after" in position) {
		for (let i = 0; i < blockOrder.length; i++) {
			if ((blockOrder.get(i) as string) === position.after) return i + 1;
		}
		return blockOrder.length;
	}

	if (typeof position === "object" && "before" in position) {
		for (let i = 0; i < blockOrder.length; i++) {
			if ((blockOrder.get(i) as string) === position.before) return i;
		}
		return 0;
	}

	if (typeof position === "object" && "parent" in position) {
		const parentMap = pipeline.blocks.get(position.parent);
		if (!parentMap) return blockOrder.length;
		const children = parentMap.get("children") as CRDTArray<string> | undefined;
		if (!children) return 0;
		return Math.min(position.index, children.length);
	}

	return blockOrder.length;
}

export function opBlockId(_pipeline: unknown, op: DocumentOp): string | null {
	if ("blockId" in op) return (op as { blockId: string }).blockId;
	if ("targetBlockId" in op)
		return (op as { targetBlockId: string }).targetBlockId;
	if ("appId" in op) return null;
	return null;
}
