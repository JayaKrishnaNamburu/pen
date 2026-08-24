import type {
	DocumentOp,
	OpOrigin,
	CRDTEvent,
	InsertBlockOp,
	SetPropsOp,
	StructuralOriginTag,
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
import { snapshotOrigin } from "./origin";
import { rejectedOwnPropKeys } from "./rejectedOwnKeys";
import { tagStructuralOrigin } from "./applyBlockOps";

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
export function applyInternal(
	pipeline: ApplyPipeline,
	ops: DocumentOp[],
	origin: OpOrigin,
	structural?: StructuralOriginTag,
): void {
	const self = pipeline as ApplyPipelineRuntime;
	if (self._applying) {
		if (self._applyTurnCount >= APPLY_STORM_QUEUE_LIMIT) {
			emitApplyStorm(pipeline);
			return;
		}
		self._applyTurnCount += 1;
		self._queue.push({ ops, origin, structural });
		return;
	}

	self._applying = true;
	self._applyTurnCount = 1;
	self._applyStormEmitted = false;
	try {
		self._executeOps(ops, origin, structural);
		while (self._queue.length > 0) {
			const {
				ops: queued,
				origin: queuedOrigin,
				structural: queuedStructural,
			} = self._queue.shift()!;
			self._executeOps(queued, queuedOrigin, queuedStructural);
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
	op: InsertBlockOp | SetPropsOp,
	pendingBlockTypes: Map<string, string>,
): InsertBlockOp | SetPropsOp {
	const self = pipeline as ApplyPipelineRuntime;
	const conversionType =
		op.type === "set-props" && typeof op.props.type === "string"
			? op.props.type
			: null;
	const blockType =
		op.type === "insert-block"
			? op.blockType
			: (conversionType ??
				pendingBlockTypes.get(op.blockId) ??
				readStoredBlockType(pipeline, op.blockId));
	if (!blockType) {
		return op;
	}
	const schema = self._registry.resolve(blockType);
	if (!schema) {
		return op;
	}
	const propsForValidation: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(op.props)) {
		if (key === "type" || key === "layout" || key === "columns") {
			continue;
		}
		if (value === null) {
			continue;
		}
		propsForValidation[key] = value;
	}
	const result = validateOpProps(schema, propsForValidation);
	for (const diagnostic of result.diagnostics) {
		emitPipelineDiagnostic(pipeline, {
			...diagnostic,
			op,
		});
	}
	if (op.type === "insert-block") {
		if (result.props === op.props) {
			return op;
		}
		return { ...op, props: result.props };
	}
	const nextProps: Record<string, unknown | null> = { ...op.props };
	for (const [key, value] of Object.entries(result.props)) {
		nextProps[key] = value;
	}
	if (conversionType) {
		const allowed = new Set(Object.keys(schema.propSchema ?? {}));
		for (const key of Object.keys(nextProps)) {
			if (
				key === "type" ||
				key === "layout" ||
				key === "columns" ||
				nextProps[key] === null
			) {
				continue;
			}
			if (!allowed.has(key)) {
				delete nextProps[key];
				emitPipelineDiagnostic(pipeline, {
					code: "prop-invalid",
					level: "warn",
					source: "schema",
					message: `Dropped incompatible prop "${key}" for type "${conversionType}"`,
					op,
				});
			}
		}
	}
	return { ...op, props: nextProps };
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

function snapshotPlain(value: unknown): unknown {
	if (value === null || typeof value !== "object") {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map(snapshotPlain);
	}
	const next: Record<string, unknown> = {};
	for (const key of Object.keys(value as object)) {
		Object.defineProperty(next, key, {
			value: snapshotPlain((value as Record<string, unknown>)[key]),
			enumerable: true,
			configurable: true,
			writable: true,
		});
	}
	return next;
}

function snapshotOps(ops: readonly DocumentOp[]): DocumentOp[] {
	return ops.map((op) => snapshotPlain(op) as DocumentOp);
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
		const next = hook(snapshotOps(ops), { origin: snapshotOrigin(origin) });
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

const MALFORMED_OP_CODE = "PEN_APPLY_004";

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function isNonNegativeInt(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isInlineInsert(value: unknown): boolean {
	if (typeof value === "string") {
		return true;
	}
	if (!isRecord(value)) {
		return false;
	}
	return isNonEmptyString(value.nodeType) && isRecord(value.props);
}

function malformedOpMessage(op: DocumentOp): string | null {
	switch (op.type) {
		case "splice-text": {
			if (!isNonEmptyString(op.blockId)) {
				return "splice-text requires a non-empty blockId";
			}
			if (!isNonNegativeInt(op.from)) {
				return "splice-text requires a non-negative integer from";
			}
			if (!isNonNegativeInt(op.to)) {
				return "splice-text requires a non-negative integer to";
			}
			if (op.from > op.to) {
				return "splice-text requires from <= to";
			}
			const items = Array.isArray(op.insert) ? op.insert : [op.insert];
			if (!items.every(isInlineInsert)) {
				return "splice-text requires string or atom insert";
			}
			if (op.cell) {
				if (!isNonNegativeInt(op.cell.row) || !isNonNegativeInt(op.cell.col)) {
					return "splice-text cell requires non-negative integer row and col";
				}
			}
			return null;
		}
		case "format-text": {
			if (!isNonEmptyString(op.blockId)) {
				return "format-text requires a non-empty blockId";
			}
			if (!isNonNegativeInt(op.from)) {
				return "format-text requires a non-negative integer from";
			}
			if (!isNonNegativeInt(op.to)) {
				return "format-text requires a non-negative integer to";
			}
			if (op.from > op.to) {
				return "format-text requires from <= to";
			}
			if (!isRecord(op.marks)) {
				return "format-text requires a marks object";
			}
			if (op.cell) {
				if (!isNonNegativeInt(op.cell.row) || !isNonNegativeInt(op.cell.col)) {
					return "format-text cell requires non-negative integer row and col";
				}
			}
			return null;
		}
		case "insert-block":
			if (!isNonEmptyString(op.blockId)) {
				return "insert-block requires a non-empty blockId";
			}
			if (!isNonEmptyString(op.blockType)) {
				return "insert-block requires a non-empty blockType";
			}
			return null;
		case "delete-block":
		case "move-block":
		case "set-props":
		case "set-meta":
		case "stream-open":
			if (!isNonEmptyString(op.blockId)) {
				return `${op.type} requires a non-empty blockId`;
			}
			if (op.type === "set-props" && !isRecord(op.props)) {
				return "set-props requires a props object";
			}
			return null;
		case "grid": {
			if (!isNonEmptyString(op.blockId)) {
				return "grid requires a non-empty blockId";
			}
			if (!isRecord(op.change) || typeof op.change.kind !== "string") {
				return "grid requires a change object";
			}
			return null;
		}
		case "app": {
			if (!isRecord(op.change) || typeof op.change.kind !== "string") {
				return "app requires a change object";
			}
			if (op.change.kind === "create") {
				if (!isNonEmptyString(op.change.appId)) {
					return "app create requires a non-empty appId";
				}
				if (!isNonEmptyString(op.change.appType)) {
					return "app create requires a non-empty appType";
				}
			} else if (
				op.change.kind === "update" ||
				op.change.kind === "delete"
			) {
				if (!isNonEmptyString(op.change.appId)) {
					return `app ${op.change.kind} requires a non-empty appId`;
				}
			}
			return null;
		}
		default: {
			const _exhaustive: never = op;
			return `unknown op type ${String((_exhaustive as { type?: unknown }).type)}`;
		}
	}
}

function emitMalformedOpDiagnostic(
	pipeline: ApplyPipeline,
	op: DocumentOp,
	error?: unknown,
): void {
	emitPipelineDiagnostic(pipeline, {
		code: MALFORMED_OP_CODE,
		level: "warn",
		source: "apply",
		message: malformedOpMessage(op) ?? `apply: dropped malformed ${op.type}`,
		remediation:
			"Pass well-formed DocumentOp fields: string ids, non-negative integer offsets, and string text.",
		op,
		...(error !== undefined ? { error } : {}),
	});
}

export function executeOps(
	pipeline: ApplyPipeline,
	ops: DocumentOp[],
	origin: OpOrigin,
	structural?: StructuralOriginTag,
): void {
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
		op.type === "insert-block" || op.type === "set-props"
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

	if (malformedOpMessage(nextOp)) {
		emitMalformedOpDiagnostic(pipeline, nextOp);
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
			if (structural) {
				tagStructuralOrigin(pipeline, structural);
			}
			for (const op of validatedOps) {
				try {
					const affected = self._executeSingleOp(op);
					affectedBlocks.push(...affected);
				} catch (err) {
					emitMalformedOpDiagnostic(pipeline, op, err);
				}
			}

			for (const blockId of affectedBlocks) {
				self._engine.markDirty(blockId);
			}

			recordPhase(pipeline, "normalize");
			self._engine.normalizeDirty();
		},
		// pass the structured origin through; do not copy — Y.UndoManager matches trackedOrigins by identity
		toStructuredOrigin(origin),
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
			hook({
				...event,
				origin: snapshotOrigin(event.origin),
			});
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
	case "set-props": {
		if (typeof op.props.type === "string") {
			if (!isRegisteredBlockType(self._registry, op.props.type)) {
				emitPipelineDiagnostic(pipeline, {
					code: "PEN_APPLY_002",
					level: "warn",
					source: "apply",
					message: `Unknown block type: "${op.props.type}"`,
					op,
				});
				return false;
			}
		}
		return true;
	}
	case "splice-text": {
		const items = Array.isArray(op.insert) ? op.insert : [op.insert];
		if (!items.every(isInlineInsert)) {
			return true;
		}
		for (const item of items) {
			if (typeof item === "string") {
				continue;
			}
			const schema = self._registry.resolveInline(item.nodeType);
			if (!schema || schema.kind !== "node") {
				emitPipelineDiagnostic(pipeline, {
					code: "PEN_APPLY_002",
					level: "warn",
					source: "apply",
					message: `Unknown inline node type: "${item.nodeType}"`,
					op,
				});
				return false;
			}
		}
		return true;
	}
	case "format-text":
	case "delete-block":
	case "move-block":
	case "set-meta":
	case "grid":
	case "app":
	case "stream-open":
		return true;
	default: {
		const _exhaustive: never = op;
		void _exhaustive;
		return true;
	}
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
		case "delete-block":
			return self._deleteBlock(op);
		case "move-block":
			return self._moveBlock(op);
		case "set-props":
			return self._setProps(op);
		case "splice-text":
			return self._spliceText(op);
		case "format-text":
			return self._formatText(op);
		case "set-meta":
			return self._setMeta(op);
		case "grid":
			return self._tableOp(op);
		case "app":
			return self._applyApp(op);
		case "stream-open":
			return [];
		default: {
			const _exhaustive: never = op;
			return _exhaustive;
		}
	}
}
