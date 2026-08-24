import type {
	ApplyOptions,
	BlockHandle,
	DocumentOp,
	Editor,
	InlineDelta,
	InlineInsert,
	SpliceTextOp,
	StructuralOriginTag,
} from "@input/pen-types";

export function spliceInsertOp(
	blockId: string,
	offset: number,
	text: string,
	marks?: Record<string, unknown | null>,
): SpliceTextOp {
	return {
		type: "splice-text",
		blockId,
		from: offset,
		to: offset,
		insert: text,
		...(marks ? { marks } : {}),
	};
}

export function spliceDeleteOp(
	blockId: string,
	offset: number,
	length: number,
): SpliceTextOp {
	return {
		type: "splice-text",
		blockId,
		from: offset,
		to: offset + length,
		insert: "",
	};
}

export function insertsFromDeltas(
	deltas: readonly InlineDelta[],
): InlineInsert | InlineInsert[] {
	const inserts: InlineInsert[] = [];
	for (const delta of deltas) {
		if (typeof delta.insert === "string") {
			if (delta.insert.length > 0) {
				inserts.push(delta.insert);
			}
			continue;
		}
		inserts.push({
			nodeType: delta.insert.type,
			props: { ...delta.insert.props },
		});
	}
	if (inserts.length === 1) {
		return inserts[0]!;
	}
	return inserts;
}

function spliceInsertsFromDeltas(
	blockId: string,
	from: number,
	deltas: readonly InlineDelta[],
): SpliceTextOp[] {
	if (deltas.length === 0) {
		return [];
	}
	const ops: SpliceTextOp[] = [];
	let offset = from;
	for (const delta of deltas) {
		if (typeof delta.insert === "string") {
			if (delta.insert.length === 0) {
				continue;
			}
			ops.push({
				type: "splice-text",
				blockId,
				from: offset,
				to: offset,
				insert: delta.insert,
				...(delta.attributes ? { marks: delta.attributes } : {}),
			});
			offset += delta.insert.length;
			continue;
		}
		ops.push({
			type: "splice-text",
			blockId,
			from: offset,
			to: offset,
			insert: {
				nodeType: delta.insert.type,
				props: { ...delta.insert.props },
			},
		});
		offset += 1;
	}
	return ops;
}

export function buildSplitBlockRecipe(options: {
	block: BlockHandle;
	offset: number;
	newBlockId: string;
	newBlockType?: string;
}): { ops: DocumentOp[]; structural: StructuralOriginTag } {
	const { block, offset, newBlockId, newBlockType } = options;
	const length = block.length();
	const sliced = sliceDeltasFrom(block.inlineDeltas(), offset);
	const ops: DocumentOp[] = [
		{
			type: "insert-block",
			blockId: newBlockId,
			blockType: newBlockType ?? block.type,
			props: block.props.parentId
				? { parentId: block.props.parentId }
				: {},
			position: { after: block.id },
		},
	];
	if (offset < length) {
		ops.push(spliceDeleteOp(block.id, offset, length - offset));
	}
	ops.push(...spliceInsertsFromDeltas(newBlockId, 0, sliced));
	return {
		ops,
		structural: {
			kind: "split",
			blockId: block.id,
			newBlockId,
			offset,
		},
	};
}

export function buildMergeBlocksRecipe(options: {
	target: BlockHandle;
	source: BlockHandle;
}): { ops: DocumentOp[]; structural: StructuralOriginTag } {
	const { target, source } = options;
	const join = target.length();
	const ops: DocumentOp[] = [
		...spliceInsertsFromDeltas(target.id, join, source.inlineDeltas()),
		{ type: "delete-block", blockId: source.id },
	];
	return {
		ops,
		structural: {
			kind: "merge",
			targetBlockId: target.id,
			sourceBlockId: source.id,
		},
	};
}

export function applySplitBlock(
	editor: Editor,
	options: {
		blockId: string;
		offset: number;
		newBlockId: string;
		newBlockType?: string;
		applyOptions?: ApplyOptions;
	},
): void {
	const block = editor.getBlock(options.blockId);
	if (!block) {
		return;
	}
	const recipe = buildSplitBlockRecipe({
		block,
		offset: options.offset,
		newBlockId: options.newBlockId,
		newBlockType: options.newBlockType,
	});
	editor.apply(recipe.ops, {
		...options.applyOptions,
		structural: recipe.structural,
	});
}

export function applyMergeBlocks(
	editor: Editor,
	options: {
		targetBlockId: string;
		sourceBlockId: string;
		applyOptions?: ApplyOptions;
	},
): void {
	const target = editor.getBlock(options.targetBlockId);
	const source = editor.getBlock(options.sourceBlockId);
	if (!target || !source) {
		return;
	}
	const recipe = buildMergeBlocksRecipe({ target, source });
	editor.apply(recipe.ops, {
		...options.applyOptions,
		structural: recipe.structural,
	});
}

export function sliceDeltasFrom(
	deltas: readonly InlineDelta[],
	from: number,
): InlineDelta[] {
	const tail: InlineDelta[] = [];
	let pos = 0;
	for (const delta of deltas) {
		const len =
			typeof delta.insert === "string" ? delta.insert.length : 1;
		if (pos + len <= from) {
			pos += len;
			continue;
		}
		if (pos < from && typeof delta.insert === "string") {
			const text = delta.insert.slice(from - pos);
			if (text.length > 0) {
				tail.push({
					insert: text,
					...(delta.attributes
						? { attributes: delta.attributes }
						: {}),
				});
			}
		} else {
			tail.push(delta);
		}
		pos += len;
	}
	return tail;
}
