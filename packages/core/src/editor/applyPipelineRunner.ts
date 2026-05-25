import type {
	DocumentOp,
	OpOrigin,
	CRDTEvent,
	InsertBlockOp,
	UpdateBlockOp,
	DeleteBlockOp,
	MoveBlockOp,
	ConvertBlockOp,
	SplitBlockOp,
	MergeBlocksOp,
	InsertTextOp,
	DeleteTextOp,
	FormatTextOp,
	ReplaceTextOp,
	InsertInlineNodeOp,
	RemoveInlineNodeOp,
	UpdateLayoutOp,
	SetMetaOp,
	CreateAppOp,
	UpdateAppOp,
	DeleteAppOp,
	SetSelectionOp,
	UpdateTableColumnsOp,
	CRDTArray,
} from "@pen/types";
import { generateId, getOpOriginType } from "@pen/types";
import { resolveRuntimeContentType } from "../schema/contentType";
import {
	type CRDTUnknownArray,
	type CRDTUnknownMap,
	getArrayProp,
	getMapProp,
	getStringProp,
	getTableColumns,
	getTableContent,
	isCRDTMap,
} from "./crdtShapes";
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
const ZERO_WIDTH_SPACE = "\u200B";


export function applyInternal(pipeline: ApplyPipeline, ops: DocumentOp[], origin: OpOrigin): void {
	const self = pipeline as ApplyPipelineRuntime;
if (self._applying) {
	self._queue.push({ ops, origin });
	return;
}

self._applying = true;
try {
	self._executeOps(ops, origin);
	while (self._queue.length > 0) {
		const { ops: queued, origin: queuedOrigin } =
			self._queue.shift()!;
		self._executeOps(queued, queuedOrigin);
	}
} finally {
	self._applying = false;
}
}

export function executeOps(pipeline: ApplyPipeline, ops: DocumentOp[], origin: OpOrigin): void {
	const self = pipeline as ApplyPipelineRuntime;
// Let extensions transform ops before validation and execution.
let transformedOps = ops;
for (const { hook } of self._beforeApplyHooks) {
	try {
		transformedOps = hook(transformedOps, { origin });
	} catch (err) {
		self._emitter.emit("diagnostic", {
			code: "PEN_APPLY_005",
			level: "error",
			source: "apply",
			message: "onBeforeApply hook threw",
			remediation:
				"Update the onBeforeApply hook to handle incoming ops defensively and " +
				"always return a valid DocumentOp array.",
			error: err,
		});
	}
}
if (self._finalBeforeApplyHook) {
	try {
		transformedOps = self._finalBeforeApplyHook(transformedOps, {
			origin,
		});
	} catch (err) {
		self._emitter.emit("diagnostic", {
			code: "PEN_APPLY_007",
			level: "error",
			source: "apply",
			message: "final apply boundary hook threw",
			remediation:
				"Update the final apply boundary hook to handle incoming ops defensively and " +
				"always return a valid DocumentOp array.",
			error: err,
		});
	}
}

self._emitApplyBoundary({
	phase: "before",
	ops: transformedOps,
	origin,
	applied: false,
});

const affectedBlocks: string[] = [];
const validatedOps: DocumentOp[] = [];
const pendingBlockIds = new Set<string>();

for (const op of transformedOps) {
	const blockId = self._opBlockId(op);

	if (!self._validateOp(op)) continue;

	if (op.type === "insert-block") {
		pendingBlockIds.add(op.blockId);
	}

	if (
		blockId &&
		!self._blockExists(blockId) &&
		!pendingBlockIds.has(blockId) &&
		op.type !== "insert-block"
	) {
		self._emitter.emit("diagnostic", {
			code: "PEN_APPLY_003",
			level: "warn",
			source: "apply",
			message: `apply: skipping ${op.type} for non-existent block "${blockId}"`,
		});
		continue;
	}

	validatedOps.push(op);
}

if (validatedOps.length === 0) {
	self._emitApplyBoundary({
		phase: "after",
		ops: transformedOps,
		origin,
		applied: false,
	});
	return;
}

self._suppressObserver = true;

try {
	self._adapter.transact(
		self._crdtDoc,
		() => {
			for (const op of validatedOps) {
				const affected = self._executeSingleOp(op);
				affectedBlocks.push(...affected);
			}

			for (const blockId of affectedBlocks) {
				self._engine.markDirty(blockId);
			}

			self._engine.normalizeDirty();
		},
		getOpOriginType(origin),
	);
} finally {
	self._suppressObserver = false;
}

const event: CRDTEvent = {
	origin,
	affectedBlocks: [...new Set(affectedBlocks)],
	ops: validatedOps,
	timestamp: Date.now(),
};

self._onDidApply?.(event);
self._emitApplyBoundary({
	phase: "after",
	ops: validatedOps,
	origin,
	applied: true,
});
}

export function emitApplyBoundary(pipeline: ApplyPipeline, event: {
	phase: "before" | "after";
	ops: readonly DocumentOp[];
	origin: OpOrigin;
	applied: boolean;
}): void {
	const self = pipeline as ApplyPipelineRuntime;
	for (const hook of self._applyBoundaryHooks) {
		try {
			hook(event);
		} catch (err) {
			self._emitter.emit("diagnostic", {
				code: "PEN_APPLY_008",
				level: "error",
				source: "apply",
				message: "apply boundary hook threw",
				remediation:
					"Update the apply boundary hook to avoid throwing during transaction lifecycle notifications.",
				error: err,
			});
		}
	}
}

export function validateOp(pipeline: ApplyPipeline, op: DocumentOp): boolean {
	const self = pipeline as ApplyPipelineRuntime;
switch (op.type) {
	case "insert-block": {
		const schema = self._registry.resolve(op.blockType);
		if (!schema) {
			self._emitter.emit("diagnostic", {
				code: "PEN_APPLY_002",
				level: "warn",
				source: "apply",
				message: `Unknown block type: "${op.blockType}"`,
				op,
			});
			return false;
		}
		return true;
	}
	case "convert-block": {
		const schema = self._registry.resolve(op.newType);
		if (!schema) {
			self._emitter.emit("diagnostic", {
				code: "PEN_APPLY_002",
				level: "warn",
				source: "apply",
				message: `Unknown block type: "${op.newType}"`,
				op,
			});
			return false;
		}
		return true;
	}
	case "insert-inline-node": {
		const schema = self._registry.resolveInline(op.nodeType);
		if (!schema || schema.kind !== "node") {
			self._emitter.emit("diagnostic", {
				code: "PEN_APPLY_002",
				level: "warn",
				source: "apply",
				message: `Unknown inline node type: "${op.nodeType}"`,
				op,
			});
			return false;
		}
		return true;
	}
	default:
		return true;
}
}

export function resolvePosition(pipeline: ApplyPipeline, position: import("@pen/types").Position): number {
	const self = pipeline as ApplyPipelineRuntime;
const blockOrder = self._doc.blockOrder;

if (position === "first") return 0;
if (position === "last") return blockOrder.length;

if (typeof position === "object" && "after" in position) {
	for (let i = 0; i < blockOrder.length; i++) {
		if ((blockOrder.get(i) as string) === position.after)
			return i + 1;
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
	const parentMap = self.blocks.get(position.parent);
	if (!parentMap) return blockOrder.length;
	const children = parentMap.get("children") as
		| CRDTArray<string>
		| undefined;
	if (!children) return 0;
	return Math.min(position.index, children.length);
}

return blockOrder.length;
}

export function executeSingleOp(pipeline: ApplyPipeline, op: DocumentOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
switch (op.type) {
	case "insert-block":
		return self._insertBlock(op);
	case "update-block":
		return self._updateBlock(op);
	case "delete-block":
		return self._deleteBlock(op);
	case "move-block":
		return self._moveBlock(op);
	case "convert-block":
		return self._convertBlock(op);
	case "split-block":
		return self._splitBlock(op);
	case "merge-blocks":
		return self._mergeBlocks(op);
	case "insert-text":
		return self._insertText(op);
	case "delete-text":
		return self._deleteText(op);
	case "format-text":
		return self._formatText(op);
	case "replace-text":
		return self._replaceText(op);
	case "insert-inline-node":
		return self._insertInlineNode(op);
	case "remove-inline-node":
		return self._removeInlineNode(op);
	case "set-selection":
		return self._setSelection(op);
	case "update-layout":
		return self._updateLayout(op);
	case "create-app":
		return self._createApp(op);
	case "update-app":
		return self._updateApp(op);
	case "delete-app":
		return self._deleteApp(op);
	case "insert-table-row":
	case "delete-table-row":
	case "insert-table-column":
	case "delete-table-column":
	case "merge-table-cells":
	case "split-table-cell":
	case "insert-table-cell-text":
	case "delete-table-cell-text":
	case "format-table-cell-text":
	case "update-table-columns":
		return self._tableOp(op);
	case "database-add-column":
	case "database-update-column":
	case "database-convert-column":
	case "database-remove-column":
	case "database-insert-row":
	case "database-update-cell":
	case "database-delete-row":
	case "database-delete-rows":
	case "database-duplicate-row":
	case "database-move-row":
	case "database-add-view":
	case "database-update-view":
	case "database-remove-view":
	case "database-set-active-view":
	case "database-update-select-options":
		return self._databaseOp(op);
	case "set-meta":
		return self._setMeta(op);
	default:
		return [];
}
}
