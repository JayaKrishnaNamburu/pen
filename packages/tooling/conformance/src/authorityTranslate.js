/**
 * Replay-only v2 → v3 translator for the authority-trace corpus.
 *
 * Same seam as `opCorpus/translate.js`: recorded `split-block` /
 * `merge-blocks` / `insert-text` stay on disk. Replay translates; the
 * fixture is never rewritten. Mapping cites `packages/core/src/ops/recipes.ts`
 * (`buildSplitBlockRecipe` / `buildMergeBlocksRecipe`) and the op-equality
 * translator.
 */

/**
 * v3 structural sequences. A split is insert-block + splice-text
 * (`recipes.ts` buildSplitBlockRecipe). A merge is splice-text +
 * delete-block (buildMergeBlocksRecipe). Remove is delete-block.
 */
const STRUCTURAL_SEQUENCE_BY_KIND = {
	split: ["insert-block", "splice-text"],
	merge: ["splice-text", "delete-block"],
	remove: ["delete-block"],
};

export function structuralSequenceLabel(kind) {
	return STRUCTURAL_SEQUENCE_BY_KIND[kind].join("+");
}

export function setupBlocksFromRecordedOps(setup) {
	const blocks = new Map();
	for (const op of setup) {
		switch (op.type) {
			case "insert-block":
				blocks.set(op.blockId, { type: op.blockType, text: "" });
				break;
			case "insert-text": {
				const block = blocks.get(op.blockId);
				if (block === undefined) {
					break;
				}
				block.text =
					block.text.slice(0, op.offset) +
					op.text +
					block.text.slice(op.offset);
				break;
			}
			case "splice-text": {
				const block = blocks.get(op.blockId);
				if (block === undefined) {
					break;
				}
				block.text =
					block.text.slice(0, op.from) +
					op.insert +
					block.text.slice(op.to);
				break;
			}
			case "delete-block":
				blocks.delete(op.blockId);
				break;
			case "split-block":
			case "merge-blocks":
				break;
			default:
				throw new Error(
					`setupBlocksFromRecordedOps: unknown recorded type ${op.type}`,
				);
		}
	}
	return blocks;
}

export function replayContextFromSetup(setup) {
	const blocks = setupBlocksFromRecordedOps(setup);
	return {
		readBlock(blockId) {
			return blocks.get(blockId) ?? null;
		},
	};
}

export function translateRecordedAuthorityOp(op, context = {}) {
	if (op == null || typeof op.type !== "string") {
		throw new Error("translateRecordedAuthorityOp: op is missing a type");
	}
	switch (op.type) {
		case "insert-block":
			return [
				{
					type: "insert-block",
					blockId: op.blockId,
					blockType: op.blockType,
					props: op.props,
					position: op.position,
				},
			];
		case "insert-text":
			return [
				{
					type: "splice-text",
					blockId: op.blockId,
					from: op.offset,
					to: op.offset,
					insert: op.text,
				},
			];
		case "splice-text":
			return [
				{
					type: "splice-text",
					blockId: op.blockId,
					from: op.from,
					to: op.to,
					insert: op.insert,
				},
			];
		case "delete-block":
			return [{ type: "delete-block", blockId: op.blockId }];
		case "split-block":
			return translateSplitBlock(op, context);
		case "merge-blocks":
			return translateMergeBlocks(op, context);
		default:
			throw new Error(
				`translateRecordedAuthorityOp: unknown recorded type ${op.type}`,
			);
	}
}

export function translateRecordedAuthorityOps(ops, context = {}) {
	return ops.flatMap((op) => translateRecordedAuthorityOp(op, context));
}

export function structuralFromRecordedCommit(commit) {
	for (const op of commit) {
		if (op.type === "split-block") {
			return {
				kind: "split",
				blockId: op.blockId,
				newBlockId: op.newBlockId,
				offset: op.offset,
			};
		}
		if (op.type === "merge-blocks") {
			return {
				kind: "merge",
				targetBlockId: op.targetBlockId,
				sourceBlockId: op.sourceBlockId,
			};
		}
	}
	return undefined;
}

/**
 * Non-vacuity: after v2→v3 translation, the commit must be a structural
 * sequence for `kind`. Empty and insert-only splices fail.
 */
export function commitIsStructuralSequence(kind, commit, setup = []) {
	if (commit.length === 0) {
		return false;
	}
	const translated = translateRecordedAuthorityOps(
		commit,
		replayContextFromSetup(setup),
	);
	if (translated.length === 0) {
		return false;
	}
	const types = new Set(translated.map((op) => op.type));
	for (const required of STRUCTURAL_SEQUENCE_BY_KIND[kind]) {
		if (!types.has(required)) {
			return false;
		}
	}
	return true;
}

function translateSplitBlock(op, context) {
	const block = context?.readBlock?.(op.blockId);
	if (!block) {
		throw new Error(
			`translateRecordedAuthorityOp: split-block needs readBlock(${JSON.stringify(op.blockId)})`,
		);
	}
	const text = block.text ?? "";
	const from = op.offset;
	const tail = text.slice(from);
	const ops = [
		{
			type: "insert-block",
			blockId: op.newBlockId,
			blockType: block.type ?? "paragraph",
			props: {},
			position: { after: op.blockId },
		},
	];
	if (from < text.length) {
		ops.push({
			type: "splice-text",
			blockId: op.blockId,
			from,
			to: text.length,
			insert: "",
		});
	}
	if (tail.length > 0) {
		ops.push({
			type: "splice-text",
			blockId: op.newBlockId,
			from: 0,
			to: 0,
			insert: tail,
		});
	}
	return ops;
}

function translateMergeBlocks(op, context) {
	const source = context?.readBlock?.(op.sourceBlockId);
	const target = context?.readBlock?.(op.targetBlockId);
	if (!source || !target) {
		throw new Error(
			`translateRecordedAuthorityOp: merge-blocks needs readBlock(${JSON.stringify(op.targetBlockId)}) and readBlock(${JSON.stringify(op.sourceBlockId)})`,
		);
	}
	const join = (target.text ?? "").length;
	const insert = source.text ?? "";
	const ops = [];
	if (insert.length > 0) {
		ops.push({
			type: "splice-text",
			blockId: op.targetBlockId,
			from: join,
			to: join,
			insert,
		});
	}
	ops.push({ type: "delete-block", blockId: op.sourceBlockId });
	return ops;
}
