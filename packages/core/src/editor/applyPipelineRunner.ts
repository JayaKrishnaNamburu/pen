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
} from "@input/pen-types";
import { generateId } from "@input/pen-types";
import type { DiagnosticEvent } from "@input/pen-types";
import { resolveRuntimeContentType } from "../schema/contentType";
import { toStructuredOrigin } from "./commitEvent";
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
import { validateOpProps } from "./validateOpProps";
import {
	APPLY_STORM_CODE,
	APPLY_STORM_QUEUE_LIMIT,
	type PipelinePhase,
} from "./pipelinePhases";
import { resolveCommitSource } from "./commitEvent";
import { rejectedOwnPropKeys } from "./rejectedOwnKeys";

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
export function applyInternal(pipeline: ApplyPipeline, ops: DocumentOp[], origin: OpOrigin): void {
	const self = pipeline as ApplyPipelineRuntime;
	if (self._applying) {
		if (self._applyTurnCount >= APPLY_STORM_QUEUE_LIMIT) {
			emitApplyStorm(pipeline);
			return;
		}
		self._applyTurnCount += 1;
		self._queue.push({ ops, origin });
		return;
	}

	self._applying = true;
	self._applyTurnCount = 1;
	self._applyStormEmitted = false;
	try {
		self._executeOps(ops, origin);
		while (self._queue.length > 0) {
			const { ops: queued, origin: queuedOrigin } = self._queue.shift()!;
			self._executeOps(queued, queuedOrigin);
		}
	} finally {
		self._applying = false;
		self._applyTurnCount = 0;
		self._applyStormEmitted = false;
	}
}

function emitPipelineDiagnostic(
	pipeline: ApplyPipeline,
	diagnostic: DiagnosticEvent,
): void {
	const self = pipeline as ApplyPipelineRuntime;
	if (!self._commitDiagnostics) {
		self._commitDiagnostics = [];
	}
	self._commitDiagnostics.push(diagnostic);
	self._emitter.emit("diagnostic", diagnostic);
}

function emitApplyStorm(pipeline: ApplyPipeline): void {
	const self = pipeline as ApplyPipelineRuntime;
	if (self._applyStormEmitted) {
		return;
	}
	self._applyStormEmitted = true;
	self._emitter.emit("diagnostic", {
		code: APPLY_STORM_CODE,
		level: "warn",
		source: "apply",
		message:
			"apply-storm: more than 16 nested applies queued in one task turn",
		remediation:
			"Observers, decoration sources, and facet compute must not apply synchronously (I7).",
	});
}

function recordPhase(pipeline: ApplyPipeline, phase: PipelinePhase): void {
	const self = pipeline as ApplyPipelineRuntime;
	self._recordPhase?.(phase);
}

function isRegisteredBlockType(
	registry: { allBlocks(): readonly { type: string }[] },
	type: string,
): boolean {
	for (const schema of registry.allBlocks()) {
		if (schema.type === type) {
			return true;
		}
	}
	return false;
}

function unknownBlockTypesReported(pipeline: ApplyPipeline): Set<string> {
	const self = pipeline as ApplyPipelineRuntime;
	if (!self._unknownBlockTypesReported) {
		self._unknownBlockTypesReported = new Set();
	}
	return self._unknownBlockTypesReported as Set<string>;
}

function emitSchemaUnknownBlock(pipeline: ApplyPipeline, type: string): void {
	const self = pipeline as ApplyPipelineRuntime;
	const reported = unknownBlockTypesReported(pipeline);
	if (reported.has(type)) {
		return;
	}
	reported.add(type);
	emitPipelineDiagnostic(pipeline, {
		code: "schema-unknown-block",
		level: "info",
		source: "schema",
		message: `Unknown block type "${type}"`,
		blockType: type,
	});
}

function reportUnknownBlocksInDocument(pipeline: ApplyPipeline): void {
	const self = pipeline as ApplyPipelineRuntime;
	for (const [, rawBlockMap] of self._doc.blocks.entries()) {
		if (!isCRDTMap(rawBlockMap)) {
			continue;
		}
		const type = rawBlockMap.get("type");
		if (typeof type !== "string") {
			continue;
		}
		if (isRegisteredBlockType(self._registry, type)) {
			continue;
		}
		emitSchemaUnknownBlock(pipeline, type);
	}
}

function readStoredBlockType(
	pipeline: ApplyPipeline,
	blockId: string,
): string | null {
	const self = pipeline as ApplyPipelineRuntime;
	const rawBlockMap = self.blocks.get(blockId);
	if (!isCRDTMap(rawBlockMap)) {
		return null;
	}
	const type = rawBlockMap.get("type");
	return typeof type === "string" ? type : null;
}

function rewriteBlockOpProps(
	pipeline: ApplyPipeline,
	op: InsertBlockOp | UpdateBlockOp,
	pendingBlockTypes: Map<string, string>,
): InsertBlockOp | UpdateBlockOp {
	const self = pipeline as ApplyPipelineRuntime;
	const blockType =
		op.type === "insert-block"
			? op.blockType
			: (pendingBlockTypes.get(op.blockId) ??
				readStoredBlockType(pipeline, op.blockId));
	if (!blockType) {
		return op;
	}
	const schema = self._registry.resolve(blockType);
	if (!schema) {
		return op;
	}
	const result = validateOpProps(schema, op.props);
	for (const diagnostic of result.diagnostics) {
		emitPipelineDiagnostic(pipeline, {
			...diagnostic,
			op,
		});
	}
	if (result.props === op.props) {
		return op;
	}
	return { ...op, props: result.props };
}

export function transformOpsThroughHooks(
	pipeline: ApplyPipeline,
	ops: DocumentOp[],
	origin: OpOrigin,
): DocumentOp[] {
	const self = pipeline as ApplyPipelineRuntime;
	let transformedOps = ops;
	const beforeApplyHooks =
		self._resolveBeforeApplyHooks?.() ??
		self._beforeApplyHooks.map(
			(entry: {
				hook: (
					ops: DocumentOp[],
					options: { origin?: OpOrigin },
				) => DocumentOp[];
			}) => entry.hook,
		);
	for (const hook of beforeApplyHooks) {
		const next = runBeforeApplyHook(pipeline, hook, transformedOps, origin, {
			code: "PEN_APPLY_005",
			message: "onBeforeApply hook threw",
			nonArrayMessage: "onBeforeApply hook returned a non-array",
			remediation:
				"Update the onBeforeApply hook to handle incoming ops defensively and " +
				"always return a valid DocumentOp array.",
		});
		if (next) {
			transformedOps = next;
		}
	}
	if (self._finalBeforeApplyHook) {
		const next = runBeforeApplyHook(
			pipeline,
			self._finalBeforeApplyHook,
			transformedOps,
			origin,
			{
				code: "PEN_APPLY_007",
				message: "final apply boundary hook threw",
				nonArrayMessage: "final apply boundary hook returned a non-array",
				remediation:
					"Update the final apply boundary hook to handle incoming ops defensively and " +
					"always return a valid DocumentOp array.",
			},
		);
		if (next) {
			transformedOps = next;
		}
	}
	return transformedOps;
}

function runBeforeApplyHook(
	pipeline: ApplyPipeline,
	hook: (
		ops: DocumentOp[],
		options: { origin?: OpOrigin },
	) => DocumentOp[],
	ops: DocumentOp[],
	origin: OpOrigin,
	labels: {
		code: string;
		message: string;
		nonArrayMessage: string;
		remediation: string;
	},
): DocumentOp[] | null {
	try {
		const next = hook(ops, { origin });
		if (!Array.isArray(next)) {
			emitPipelineDiagnostic(pipeline, {
				code: labels.code,
				level: "error",
				source: "apply",
				message: labels.nonArrayMessage,
				remediation: labels.remediation,
			});
			return null;
		}
		return next;
	} catch (err) {
		emitPipelineDiagnostic(pipeline, {
			code: labels.code,
			level: "error",
			source: "apply",
			message: labels.message,
			remediation: labels.remediation,
			error: err,
		});
		return null;
	}
}

export function executeOps(pipeline: ApplyPipeline, ops: DocumentOp[], origin: OpOrigin): void {
	const self = pipeline as ApplyPipelineRuntime;
	self._commitDiagnostics = [];
	reportUnknownBlocksInDocument(pipeline);
	self._captureSelectionBefore?.();
	recordPhase(pipeline, "hooks");
	const transformedOps = transformOpsThroughHooks(pipeline, ops, origin);

self._emitApplyBoundary({
	phase: "before",
	ops: transformedOps,
	origin,
	applied: false,
});

recordPhase(pipeline, "validate");
const affectedBlocks: string[] = [];
const validatedOps: DocumentOp[] = [];
const pendingBlockIds = new Set<string>();
const pendingBlockTypes = new Map<string, string>();

for (const op of transformedOps) {
	const blockId = self._opBlockId(op);

	if (!self._validateOp(op)) continue;

	if (op.type === "insert-block") {
		pendingBlockIds.add(op.blockId);
		pendingBlockTypes.set(op.blockId, op.blockType);
	}

	const nextOp =
		op.type === "insert-block" || op.type === "update-block"
			? rewriteBlockOpProps(pipeline, op, pendingBlockTypes)
			: op;

	if (
		blockId &&
		!self._blockExists(blockId) &&
		!pendingBlockIds.has(blockId) &&
		nextOp.type !== "insert-block"
	) {
		emitPipelineDiagnostic(pipeline, {
			code: "PEN_APPLY_003",
			level: "warn",
			source: "apply",
			message: `apply: skipping ${op.type} for non-existent block "${blockId}"`,
		});
		continue;
	}

	validatedOps.push(nextOp);
}

if (validatedOps.length === 0) {
	self._commitDiagnostics = [];
	self._emitApplyBoundary({
		phase: "after",
		ops: transformedOps,
		origin,
		applied: false,
	});
	return;
}

recordPhase(pipeline, "execute");
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

			recordPhase(pipeline, "normalize");
			self._engine.normalizeDirty();
		},
		{ ...toStructuredOrigin(origin) },
	);
} finally {
	self._suppressObserver = false;
}

const event: CRDTEvent = {
	origin,
	affectedBlocks: [...new Set(affectedBlocks)],
	ops: validatedOps,
	timestamp: Date.now(),
	source: resolveCommitSource(origin, "apply"),
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
			emitPipelineDiagnostic(pipeline, {
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
	const rejectedKeys = [...new Set(rejectedOwnPropKeys(op))];
	if (rejectedKeys.length > 0) {
		emitPipelineDiagnostic(pipeline, {
			code: "PEN_APPLY_009",
			level: "warn",
			source: "apply",
			message: `apply: rejected prototype keys in ${op.type} (${rejectedKeys.join(", ")})`,
			remediation:
				"Remove __proto__, constructor, and prototype own keys from op props.",
			op,
		});
		return false;
	}
switch (op.type) {
	case "insert-block": {
		if (!isRegisteredBlockType(self._registry, op.blockType)) {
			emitPipelineDiagnostic(pipeline, {
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
		if (!isRegisteredBlockType(self._registry, op.newType)) {
			emitPipelineDiagnostic(pipeline, {
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
			emitPipelineDiagnostic(pipeline, {
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

export function resolvePosition(pipeline: ApplyPipeline, position: import("@input/pen-types").Position): number {
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
	case "set-meta":
		return self._setMeta(op);
	case "stream-open":
		return [];
	default: {
		const _exhaustive: never = op;
		return _exhaustive;
	}
}
}
