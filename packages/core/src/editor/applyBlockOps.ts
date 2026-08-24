import type {
	InsertBlockOp,
	DeleteBlockOp,
	MoveBlockOp,
	SetPropsOp,
	StructuralOriginTag,
	TableColumnSchema,
} from "@input/pen-types";
import { STRUCTURAL_ORIGIN_META_KEY } from "@input/pen-crdt-yjs";
import { resolveRuntimeContentType } from "../schema/contentType";
import {
	type CRDTUnknownMap,
	getMapProp,
	getTableContent,
} from "./crdtShapes";
import type { ApplyPipeline } from "./apply";

type ApplyPipelineRuntime = any;
type MutableMap = CRDTUnknownMap & { delete(key: string): void };

export function insertBlock(pipeline: ApplyPipeline, op: InsertBlockOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
	const schema = self._registry.resolve(op.blockType);
	if (!schema) return [];

	const contentType = resolveRuntimeContentType(schema);
	const blockMap = self._adapter.initBlockMap(
		self._crdtDoc,
		op.blockId,
		op.blockType,
		contentType,
	) as MutableMap;

	if (op.props && Object.keys(op.props).length > 0) {
		const propsMap = self._getOrCreateMapProp(blockMap, "props");
		for (const [key, value] of Object.entries(op.props)) {
			propsMap.set(key, value);
		}
	}

	if ((schema as { content: unknown }).content === "subdocument") {
		const propsMap = self._getOrCreateMapProp(blockMap, "props");
		const subdocument = blockMap.get("subdocument") as
			| { guid?: unknown }
			| undefined;
		if (
			subdocument &&
			typeof subdocument === "object" &&
			typeof subdocument.guid === "string"
		) {
			propsMap.set("subdocumentGuid", subdocument.guid);
		}
	}

	if (typeof op.position === "object" && "parent" in op.position) {
		const parentMap = self._getMutableBlockMap(op.position.parent);
		if (parentMap) {
			const children = self._getOrCreateStringArrayProp(
				parentMap,
				"children",
			);
			const idx = Math.min(op.position.index, children.length);
			children.insert(idx, [op.blockId]);
		}
	} else {
		const idx = self._resolvePosition(op.position);
		self.mutableBlockOrder.insert(idx, [op.blockId]);
	}

	return [op.blockId];
}

export function deleteBlock(pipeline: ApplyPipeline, op: DeleteBlockOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
	self.mutableBlocks.delete(op.blockId);
	self._removeBlockIdFromArray(self.mutableBlockOrder, op.blockId);
	self._removeBlockIdFromAllChildren(op.blockId);

	return [op.blockId];
}

export function moveBlock(pipeline: ApplyPipeline, op: MoveBlockOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
	self._removeBlockIdFromArray(self.mutableBlockOrder, op.blockId, true);
	self._removeBlockIdFromAllChildren(op.blockId);

	if (typeof op.position === "object" && "parent" in op.position) {
		const parentMap = self._getMutableBlockMap(op.position.parent);
		if (parentMap) {
			const children = self._getOrCreateStringArrayProp(
				parentMap,
				"children",
			);
			const idx = Math.min(op.position.index, children.length);
			children.insert(idx, [op.blockId]);
		}
	} else {
		const idx = self._resolvePosition(op.position);
		self.mutableBlockOrder.insert(idx, [op.blockId]);
	}

	return [op.blockId];
}

function convertBlock(
	pipeline: ApplyPipeline,
	blockId: string,
	newType: string,
	newProps?: Record<string, unknown>,
): string[] {
	const self = pipeline as ApplyPipelineRuntime;
	const blockMap = self._getMutableBlockMap(blockId);
	if (!blockMap) return [];

	const oldType = blockMap.get("type") as string;
	const oldSchema = self._registry.resolve(oldType);
	const newSchema = self._registry.resolve(newType);
	if (!newSchema) return [];

	blockMap.set("type", newType);

	const propsMap = getMapProp(blockMap, "props");
	if (propsMap) {
		const mutablePropsMap = propsMap as MutableMap;
		const newPropKeys = new Set(Object.keys(newSchema.propSchema ?? {}));
		for (const key of [...(mutablePropsMap.keys?.() ?? [])]) {
			if (!newPropKeys.has(key)) {
				mutablePropsMap.delete(key);
			}
		}
	}

	if (newProps) {
		const props = self._getOrCreateMapProp(blockMap, "props");
		for (const [key, value] of Object.entries(newProps)) {
			props.set(key, value);
		}
	}

	const oldContent = oldSchema?.content;
	const newContent = newSchema.content;
	const preservedInlineDeltas =
		oldContent === "inline"
			? self._getPreservedInlineDeltas(self._getTextContent(blockMap))
			: [];

	if (oldContent === "inline" && newContent !== "inline") {
		if (
			newContent === "none" ||
			newContent === "table" ||
			Array.isArray(newContent)
		) {
			blockMap.delete("content");
		}
	} else if (oldContent !== "inline" && newContent === "inline") {
		const ytext = self._adapter.createText();
		blockMap.set("content", ytext);
	}

	const targetContent = resolveRuntimeContentType(newSchema);
	if (targetContent === "table") {
		blockMap.delete("tableColumns");
	} else {
		self._clearTableState(blockMap);
	}

	if (targetContent === "table" && !getTableContent(blockMap)) {
		self._tableGrid.seedTableBlock(blockMap, {
			rowCount: 2,
			colCount: 2,
			preservedInlineDeltas,
		});
	}

	return [blockId];
}

function applyLayoutReplacement(
	pipeline: ApplyPipelineRuntime,
	blockMap: MutableMap,
	layout: unknown,
): void {
	if (layout === null) {
		blockMap.delete("layout");
		return;
	}
	if (layout === undefined || typeof layout !== "object" || Array.isArray(layout)) {
		return;
	}
	const layoutMap = pipeline._getOrCreateMapProp(blockMap, "layout");
	const next = layout as Record<string, unknown>;
	for (const key of [...(layoutMap.keys?.() ?? [])]) {
		if (!(key in next)) {
			layoutMap.delete(key);
		}
	}
	for (const [key, value] of Object.entries(next)) {
		if (value === undefined || value === null) {
			layoutMap.delete(key);
		} else {
			layoutMap.set(key, value);
		}
	}
}

export function setProps(pipeline: ApplyPipeline, op: SetPropsOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
	const blockMap = self._getMutableBlockMap(op.blockId);
	if (!blockMap) return [];

	const nextType = op.props.type;
	const layout = op.props.layout;
	const columns = op.props.columns;
	const regular: Record<string, unknown | null> = {};
	for (const [key, value] of Object.entries(op.props)) {
		if (key === "type" || key === "layout" || key === "columns") {
			continue;
		}
		regular[key] = value;
	}

	if (typeof nextType === "string") {
		const newProps: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(regular)) {
			if (value !== undefined && value !== null) {
				newProps[key] = value;
			}
		}
		convertBlock(pipeline, op.blockId, nextType, newProps);
		const propsMap = self._getOrCreateMapProp(blockMap, "props");
		for (const [key, value] of Object.entries(regular)) {
			if (value === null) {
				propsMap.delete(key);
			}
		}
	} else {
		const propsMap = self._getOrCreateMapProp(blockMap, "props");
		for (const [key, value] of Object.entries(regular)) {
			if (value === undefined || value === null) {
				propsMap.delete(key);
			} else {
				propsMap.set(key, value);
			}
		}
	}

	if (layout !== undefined) {
		applyLayoutReplacement(self, blockMap, layout);
	}

	if (columns !== undefined) {
		if (columns === null) {
			blockMap.delete("tableColumns");
		} else if (Array.isArray(columns)) {
			self._tableGrid.setStructuredTableColumns(
				blockMap,
				columns as TableColumnSchema[],
			);
		}
	}

	return [op.blockId];
}

export function tagStructuralOrigin(
	pipeline: ApplyPipeline,
	structural: StructuralOriginTag,
): void {
	const self = pipeline as ApplyPipelineRuntime;
	const raw = self._adapter.raw?.(self._crdtDoc) as
		| { _transaction?: { meta?: Map<unknown, unknown> } }
		| undefined;
	const txn = raw?._transaction;
	// write split/merge intent onto txn.meta only — never mutate the origin
	// object. Y.UndoManager matches trackedOrigins by identity; hanging extra
	// fields on the live origin is the same class of bug as copying it.
	txn?.meta?.set(STRUCTURAL_ORIGIN_META_KEY, structural);
}
