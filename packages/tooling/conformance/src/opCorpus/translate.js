/**
 * Replay-only v2 → v3 DocumentOp translator.
 *
 * The committed corpus stores old-world ops. Production `editor.apply`
 * must not accept those shapes after the union slims (`spec/rules/pipeline.md`
 * Non-Goals: no dual-form apply path). This module is the checker seam:
 * translate at replay, compare bytes/snapshot, never rewrite the fixtures.
 *
 * Mapping cites `spec/rules/pipeline.md` §5.
 */

const SET_SELECTION_REPLAY = "__penReplaySetSelection";

const UNCHANGED_TYPES = new Set([
	"insert-block",
	"delete-block",
	"move-block",
	"set-meta",
	"stream-open",
	"splice-text",
	"set-props",
	"grid",
	"app",
]);

/**
 * Always produces the v3 primitive shape(s) for one recorded v2 op.
 * Shape differs from the recording for every folded type (insert-text →
 * splice-text, update-block → set-props, …). Unchanged names stay as-is.
 *
 * `split-block` / `merge-blocks` need `context.readBlock` once the
 * compound ops leave the live union. `set-selection` becomes a replay
 * tag — not an apply-able op.
 *
 * @param {Record<string, unknown>} op
 * @param {{ readBlock?: (blockId: string) => ReplayBlock | null }} [context]
 * @returns {Array<Record<string, unknown>>}
 */
export function translateRecordedOp(op, context = {}) {
	if (op == null || typeof op.type !== "string") {
		throw new Error("translateRecordedOp: op is missing a type");
	}

	if (UNCHANGED_TYPES.has(op.type)) {
		return [op];
	}

	switch (op.type) {
		case "insert-text":
			return [
				{
					type: "splice-text",
					blockId: op.blockId,
					from: op.offset,
					to: op.offset,
					insert: op.text,
					...(op.marks !== undefined ? { marks: op.marks } : {}),
				},
			];
		case "delete-text":
			return [
				{
					type: "splice-text",
					blockId: op.blockId,
					from: op.offset,
					to: op.offset + op.length,
					insert: "",
				},
			];
		case "replace-text":
			return [
				{
					type: "splice-text",
					blockId: op.blockId,
					from: op.offset,
					to: op.offset + op.length,
					insert: op.text,
					...(op.marks !== undefined ? { marks: op.marks } : {}),
				},
			];
		case "insert-inline-node":
			return [
				{
					type: "splice-text",
					blockId: op.blockId,
					from: op.offset,
					to: op.offset,
					insert: { nodeType: op.nodeType, props: op.props ?? {} },
				},
			];
		case "remove-inline-node":
			return [
				{
					type: "splice-text",
					blockId: op.blockId,
					from: op.offset,
					to: op.offset + 1,
					insert: "",
				},
			];
		case "insert-table-cell-text":
			return [
				{
					type: "splice-text",
					blockId: op.blockId,
					cell: { row: op.row, col: op.col },
					from: op.offset,
					to: op.offset,
					insert: op.text,
				},
			];
		case "delete-table-cell-text":
			return [
				{
					type: "splice-text",
					blockId: op.blockId,
					cell: { row: op.row, col: op.col },
					from: op.offset,
					to: op.offset + op.length,
					insert: "",
				},
			];
		case "format-text":
			if (typeof op.from === "number") {
				return [op];
			}
			return [
				{
					type: "format-text",
					blockId: op.blockId,
					from: op.offset,
					to: op.offset + op.length,
					marks: op.marks,
				},
			];
		case "format-table-cell-text":
			return [
				{
					type: "format-text",
					blockId: op.blockId,
					cell: { row: op.row, col: op.col },
					from: op.offset,
					to: op.offset + op.length,
					marks: op.marks,
				},
			];
		case "update-block":
			return [
				{
					type: "set-props",
					blockId: op.blockId,
					props: op.props ?? {},
				},
			];
		case "convert-block":
			return [
				{
					type: "set-props",
					blockId: op.blockId,
					props: {
						type: op.newType,
						...(op.newProps ?? {}),
					},
				},
			];
		case "update-layout":
			return [
				{
					type: "set-props",
					blockId: op.blockId,
					props: { layout: op.layout },
				},
			];
		case "update-table-columns":
			return [
				{
					type: "set-props",
					blockId: op.blockId,
					props: { columns: op.columns },
				},
			];
		case "insert-table-row":
			return [
				{
					type: "grid",
					blockId: op.blockId,
					change: { kind: "insert-row", index: op.index },
				},
			];
		case "delete-table-row":
			return [
				{
					type: "grid",
					blockId: op.blockId,
					change: { kind: "delete-row", index: op.index },
				},
			];
		case "insert-table-column":
			return [
				{
					type: "grid",
					blockId: op.blockId,
					change: { kind: "insert-column", index: op.index },
				},
			];
		case "delete-table-column":
			return [
				{
					type: "grid",
					blockId: op.blockId,
					change: { kind: "delete-column", index: op.index },
				},
			];
		case "merge-table-cells":
			return [
				{
					type: "grid",
					blockId: op.blockId,
					change: {
						kind: "merge-cells",
						anchor: op.anchor,
						head: op.head,
					},
				},
			];
		case "split-table-cell":
			return [
				{
					type: "grid",
					blockId: op.blockId,
					change: { kind: "split-cell", row: op.row, col: op.col },
				},
			];
		case "create-app":
			return [
				{
					type: "app",
					change: {
						kind: "create",
						appId: op.appId,
						appType: op.appType,
						config: op.config ?? {},
						placement: op.placement,
					},
				},
			];
		case "update-app":
			return [
				{
					type: "app",
					change: {
						kind: "update",
						appId: op.appId,
						patch: op.patch ?? {},
					},
				},
			];
		case "delete-app":
			return [
				{
					type: "app",
					change: { kind: "delete", appId: op.appId },
				},
			];
		case "split-block":
			return translateSplitBlock(op, context);
		case "merge-blocks":
			return translateMergeBlocks(op, context);
		case "set-selection":
			return [
				{
					[SET_SELECTION_REPLAY]: true,
					selection: op.selection,
				},
			];
		default:
			throw new Error(
				`translateRecordedOp: unknown recorded type ${op.type}`,
			);
	}
}

/**
 * Choose recorded vs translated ops for one apply.
 *
 * While the live union still names the recorded type (today's 30-member
 * world), pass the recorded op through so apply stays valid. Once
 * `splice-text` is in the live union the rewrite has landed and every
 * recorded op is translated — including `format-text`, whose type name
 * survives but whose fields rename (`offset`/`length` → `from`/`to`).
 *
 * @param {Array<Record<string, unknown>>} ops
 * @param {{ liveTypes: Set<string>, context?: object }} options
 */
export function opsForReplay(ops, options) {
	const liveTypes = options.liveTypes;
	const rewriteLanded = liveTypes.has("splice-text");
	if (!rewriteLanded) {
		return [...ops];
	}
	return ops.flatMap((op) => translateRecordedOp(op, options.context));
}

export function isSetSelectionReplay(op) {
	return op != null && op[SET_SELECTION_REPLAY] === true;
}

/**
 * @typedef {{ type?: string, text?: string, delta?: Array<{ insert: unknown, attributes?: object }> }} ReplayBlock
 */

function translateSplitBlock(op, context) {
	const block = context?.readBlock?.(op.blockId);
	if (!block) {
		throw new Error(
			`translateRecordedOp: split-block needs readBlock(${JSON.stringify(op.blockId)})`,
		);
	}
	const delta = block.delta ?? [{ insert: block.text ?? "" }];
	const total = deltaLength(delta);
	const from = op.offset;
	const tail = sliceDelta(delta, from);
	return [
		{
			type: "insert-block",
			blockId: op.newBlockId,
			blockType: op.newBlockType ?? block.type ?? "paragraph",
			props: {},
			position: { after: op.blockId },
		},
		{
			type: "splice-text",
			blockId: op.blockId,
			from,
			to: total,
			insert: "",
		},
		{
			type: "splice-text",
			blockId: op.newBlockId,
			from: 0,
			to: 0,
			insert: insertsFromDelta(tail),
		},
	];
}

function translateMergeBlocks(op, context) {
	const source = context?.readBlock?.(op.sourceBlockId);
	const target = context?.readBlock?.(op.targetBlockId);
	if (!source || !target) {
		throw new Error(
			`translateRecordedOp: merge-blocks needs readBlock(${JSON.stringify(op.targetBlockId)}) and readBlock(${JSON.stringify(op.sourceBlockId)})`,
		);
	}
	const targetDelta = target.delta ?? [{ insert: target.text ?? "" }];
	const sourceDelta = source.delta ?? [{ insert: source.text ?? "" }];
	const join = deltaLength(targetDelta);
	return [
		{
			type: "splice-text",
			blockId: op.targetBlockId,
			from: join,
			to: join,
			insert: insertsFromDelta(sourceDelta),
		},
		{
			type: "delete-block",
			blockId: op.sourceBlockId,
		},
	];
}

function deltaLength(delta) {
	let length = 0;
	for (const item of delta) {
		length += typeof item.insert === "string" ? item.insert.length : 1;
	}
	return length;
}

function sliceDelta(delta, from) {
	const tail = [];
	let pos = 0;
	for (const item of delta) {
		const len = typeof item.insert === "string" ? item.insert.length : 1;
		if (pos + len <= from) {
			pos += len;
			continue;
		}
		if (pos < from && typeof item.insert === "string") {
			const text = item.insert.slice(from - pos);
			if (text) {
				tail.push({
					insert: text,
					...(item.attributes ? { attributes: item.attributes } : {}),
				});
			}
		} else {
			tail.push(item);
		}
		pos += len;
	}
	return tail;
}

function insertsFromDelta(delta) {
	if (delta.length === 0) {
		return "";
	}
	if (delta.length === 1 && typeof delta[0].insert === "string") {
		return delta[0].insert;
	}
	return delta.map((item) => {
		if (typeof item.insert === "string") {
			return item.insert;
		}
		if (item.insert && typeof item.insert === "object") {
			const embed = item.insert;
			return {
				nodeType: embed.type ?? embed.nodeType ?? "unknown",
				props: embed.props ?? embed,
			};
		}
		return "";
	});
}
