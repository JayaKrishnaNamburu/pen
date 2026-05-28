import type { CRDTDocument, CRDTArray, CRDTMap, DocumentOp } from "@pen/types";
import {
	type CRDTUnknownArray,
	type CRDTUnknownMap,
	getArrayProp,
	getMapProp,
} from "./crdtShapes";
import type { SchemaEngineImpl } from "../schema/normalize";
import type { ApplyPipeline } from "./apply";

type ApplyPipelineRuntime = any;
type MutableMap = CRDTUnknownMap & { delete(key: string): void };
type MutableStringArray = CRDTUnknownArray<string>;
interface CRDTInlineText extends CRDTText {
	insertEmbed(offset: number, value: Record<string, unknown>): void;
}
interface CRDTText {
	insert(offset: number, text: string, attributes?: Record<string, unknown | null>): void;
	delete(offset: number, length: number): void;
	format(offset: number, length: number, attributes: Record<string, unknown>): void;
	toDelta(): Array<{ insert: string | object; attributes?: Record<string, unknown> }>;
	toString(): string;
	readonly length: number;
}


export function blockExists(pipeline: ApplyPipeline, blockId: string): boolean {
	const self = pipeline as ApplyPipelineRuntime;
return self.blocks.has(blockId);
}

export function createMutableMap(pipeline: ApplyPipeline, ): MutableMap {
	const self = pipeline as ApplyPipelineRuntime;
return self._adapter.createMap() as MutableMap;
}

export function getMutableBlockMap(pipeline: ApplyPipeline, blockId: string): MutableMap | null {
	const self = pipeline as ApplyPipelineRuntime;
return (
	(self.blocks.get(blockId) as unknown as MutableMap | undefined) ??
	null
);
}

export function getMutableAppMap(pipeline: ApplyPipeline, appId: string): MutableMap | null {
	const self = pipeline as ApplyPipelineRuntime;
return (
	(self.apps.get(appId) as unknown as MutableMap | undefined) ?? null
);
}

export function getOrCreateMapProp(pipeline: ApplyPipeline, 
	container: CRDTUnknownMap,
	key: string,
): MutableMap {
	const self = pipeline as ApplyPipelineRuntime;
const existing = getMapProp(container, key);
if (existing) {
	return existing as MutableMap;
}
const map = self._createMutableMap();
container.set(key, map);
return map;
}

export function getOrCreateStringArrayProp(pipeline: ApplyPipeline, 
	container: CRDTUnknownMap,
	key: string,
): MutableStringArray {
	const self = pipeline as ApplyPipelineRuntime;
const existing = getArrayProp<string>(container, key);
if (existing) {
	return existing as MutableStringArray;
}
const array = self._adapter.createArray() as MutableStringArray;
container.set(key, array);
return array;
}

export function removeBlockIdFromArray(pipeline: ApplyPipeline, 
	array: MutableStringArray,
	blockId: string,
	stopAfterFirst = false,
): void {
	const self = pipeline as ApplyPipelineRuntime;
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

export function removeBlockIdFromAllChildren(pipeline: ApplyPipeline, blockId: string): void {
	const self = pipeline as ApplyPipelineRuntime;
for (const [, parentMap] of self.blocks.entries()) {
	const children = getArrayProp<string>(
		parentMap as unknown as CRDTUnknownMap,
		"children",
	);
	if (!children) {
		continue;
	}
	self._removeBlockIdFromArray(
		children as MutableStringArray,
		blockId,
	);
}
}

export function getTextContent(pipeline: ApplyPipeline, blockMap: CRDTUnknownMap): CRDTText | undefined {
	const self = pipeline as ApplyPipelineRuntime;
const content = blockMap.get("content");
return content &&
	typeof content === "object" &&
	typeof (content as { insert?: unknown }).insert === "function" &&
	typeof (content as { delete?: unknown }).delete === "function" &&
	typeof (content as { format?: unknown }).format === "function" &&
	typeof (content as { toDelta?: unknown }).toDelta === "function" &&
	typeof (content as { toString?: unknown }).toString ===
		"function" &&
	typeof (content as { length?: unknown }).length === "number"
	? (content as CRDTText)
	: undefined;
}

export function getInlineTextContent(pipeline: ApplyPipeline, 
	blockMap: CRDTUnknownMap,
): CRDTInlineText | undefined {
	const self = pipeline as ApplyPipelineRuntime;
const content = self._getTextContent(blockMap);
return content &&
	typeof (content as { insertEmbed?: unknown }).insertEmbed ===
		"function"
	? (content as CRDTInlineText)
	: undefined;
}

export function opBlockId(pipeline: ApplyPipeline, op: DocumentOp): string | null {
	const self = pipeline as ApplyPipelineRuntime;
if ("blockId" in op) return (op as { blockId: string }).blockId;
if ("targetBlockId" in op)
	return (op as { targetBlockId: string }).targetBlockId;
if ("appId" in op) return null;
return null;
}
