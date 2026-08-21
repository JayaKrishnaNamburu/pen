import * as Y from "yjs";

export const ANCHOR_WORD = "meadow ";
export const ANCHOR_WORD_REPEAT = 10_000;
export const ANCHOR_ENCODE_COUNT = 1_000;
export const ANCHOR_BLOCK_COUNT = 200;
export const SPLIT_SOURCE_TEXT = "meadow sage";
export const SPLIT_OFFSET = 6;
export const SPLIT_HEAD_TEXT = "meadow";
export const SPLIT_TAIL_TEXT = " sage";

export interface MintedAnchor {
	offset: number;
	assoc: number;
	encoded: Uint8Array;
	type: Y.Text;
}

export interface ResolvedAnchor {
	index: number | null;
	type: Y.Text | null;
	deleted: boolean;
}

export function createPenShapedDoc(clientID = 0): {
	doc: Y.Doc;
	blocks: Y.Map<Y.Map<unknown>>;
} {
	const doc = new Y.Doc({ gc: false });
	doc.clientID = clientID;
	const blocks = doc.getMap<Y.Map<unknown>>("blocks");
	return { doc, blocks };
}

export function insertBlockText(
	doc: Y.Doc,
	blocks: Y.Map<Y.Map<unknown>>,
	blockId: string,
	text: string,
): Y.Text {
	const content = new Y.Text();
	const block = new Y.Map<unknown>();
	doc.transact(() => {
		content.insert(0, text);
		block.set("type", "paragraph");
		block.set("content", content);
		blocks.set(blockId, block);
	});
	return content;
}

export function mintEncoded(
	text: Y.Text,
	offset: number,
	assoc: number,
): Uint8Array {
	const relative = Y.createRelativePositionFromTypeIndex(text, offset, assoc);
	return Y.encodeRelativePosition(relative);
}

export function resolveEncoded(doc: Y.Doc, encoded: Uint8Array): ResolvedAnchor {
	const relative = Y.decodeRelativePosition(encoded);
	const absolute = Y.createAbsolutePositionFromRelativePosition(relative, doc);
	if (!absolute) {
		return { index: null, type: null, deleted: false };
	}
	const type = absolute.type as Y.Text;
	return {
		index: absolute.index,
		type,
		deleted: type._item?.deleted === true,
	};
}

export function createScaleTextFixture(): {
	doc: Y.Doc;
	content: Y.Text;
	text: string;
	encoded: Uint8Array[];
	offsets: number[];
} {
	const { doc, blocks } = createPenShapedDoc();
	const text = ANCHOR_WORD.repeat(ANCHOR_WORD_REPEAT);
	const content = insertBlockText(doc, blocks, "b1", text);
	const encoded: Uint8Array[] = [];
	const offsets: number[] = [];
	for (let i = 0; i < ANCHOR_ENCODE_COUNT; i++) {
		const offset = Math.floor((i / ANCHOR_ENCODE_COUNT) * text.length);
		offsets.push(offset);
		encoded.push(mintEncoded(content, offset, 1));
	}
	return { doc, content, text, encoded, offsets };
}

export function createBlockScaleFixture(): {
	doc: Y.Doc;
	encoded: Uint8Array[];
	blockIds: string[];
} {
	const { doc, blocks } = createPenShapedDoc();
	const encoded: Uint8Array[] = [];
	const blockIds: string[] = [];
	for (let i = 0; i < ANCHOR_BLOCK_COUNT; i++) {
		const id = `b${i}`;
		blockIds.push(id);
		const content = insertBlockText(doc, blocks, id, `block text ${i}`);
		encoded.push(mintEncoded(content, 0, 1));
	}
	return { doc, encoded, blockIds };
}

export function splitBlockCopy(
	source: Y.Text,
	dest: Y.Text,
	offset: number,
): void {
	const deltas = source.toDelta();
	const tailDeltas: Array<{
		insert: string | object;
		attributes?: Record<string, unknown>;
	}> = [];
	let pos = 0;
	for (const delta of deltas) {
		const insert = delta.insert;
		const len = typeof insert === "string" ? insert.length : 1;
		if (pos + len <= offset) {
			pos += len;
			continue;
		}
		if (pos < offset && typeof insert === "string") {
			const tailText = insert.slice(offset - pos);
			if (tailText) {
				tailDeltas.push({
					insert: tailText,
					attributes: delta.attributes,
				});
			}
		} else {
			tailDeltas.push(delta);
		}
		pos += len;
	}
	const totalLength = source.length;
	source.doc?.transact(() => {
		if (offset < totalLength) {
			source.delete(offset, totalLength - offset);
		}
		for (const delta of tailDeltas) {
			dest.insert(
				dest.length,
				delta.insert as string,
				delta.attributes,
			);
		}
	});
}

export interface SplitFollowCase {
	name: string;
	offset: number;
	assoc: number;
	v2Block: "src" | "dest";
	v2Offset: number;
}

export const SPLIT_FOLLOW_CASES: SplitFollowCase[] = [
	{ name: "head", offset: 3, assoc: 1, v2Block: "src", v2Offset: 3 },
	{
		name: "split-assoc-minus1",
		offset: SPLIT_OFFSET,
		assoc: -1,
		v2Block: "src",
		v2Offset: SPLIT_OFFSET,
	},
	{
		name: "split-assoc-plus1",
		offset: SPLIT_OFFSET,
		assoc: 1,
		v2Block: "dest",
		v2Offset: 0,
	},
	{ name: "tail", offset: 9, assoc: 1, v2Block: "dest", v2Offset: 3 },
];

export interface SplitFollowResult {
	name: string;
	resolvedIndex: number | null;
	onSource: boolean;
	onDest: boolean;
	matchesV2: boolean;
	stuckOnSource: boolean;
}

export function measureSplitFollow(): {
	sourceText: string;
	destText: string;
	results: SplitFollowResult[];
	stuckCount: number;
	followedCount: number;
	v2MismatchCount: number;
} {
	const { doc, blocks } = createPenShapedDoc();
	const source = insertBlockText(doc, blocks, "src", SPLIT_SOURCE_TEXT);
	const dest = insertBlockText(doc, blocks, "dest", "");
	const minted: MintedAnchor[] = SPLIT_FOLLOW_CASES.map((entry) => ({
		offset: entry.offset,
		assoc: entry.assoc,
		encoded: mintEncoded(source, entry.offset, entry.assoc),
		type: source,
	}));

	splitBlockCopy(source, dest, SPLIT_OFFSET);

	const results = SPLIT_FOLLOW_CASES.map((entry, index) => {
		const mintedAnchor = minted[index]!;
		const resolved = resolveEncoded(doc, mintedAnchor.encoded);
		const onSource = resolved.type === source;
		const onDest = resolved.type === dest;
		const matchesV2 =
			(entry.v2Block === "src" ? onSource : onDest) &&
			resolved.index === entry.v2Offset;
		const stuckOnSource =
			entry.v2Block === "dest" && onSource && !onDest;
		return {
			name: entry.name,
			resolvedIndex: resolved.index,
			onSource,
			onDest,
			matchesV2,
			stuckOnSource,
		};
	});

	return {
		sourceText: source.toString(),
		destText: dest.toString(),
		results,
		stuckCount: results.filter((result) => result.stuckOnSource).length,
		followedCount: results.filter((result) => result.matchesV2).length,
		v2MismatchCount: results.filter((result) => !result.matchesV2).length,
	};
}

export function encodeSizes(encoded: readonly Uint8Array[]): {
	minBytes: number;
	maxBytes: number;
	p50Bytes: number;
	p95Bytes: number;
	count: number;
} {
	if (encoded.length === 0) {
		throw new Error("encodeSizes: empty population");
	}
	const sizes = encoded.map((item) => item.byteLength).sort((a, b) => a - b);
	const atPercentile = (percentile: number) => {
		const index = Math.min(
			sizes.length - 1,
			Math.max(0, Math.ceil((percentile / 100) * sizes.length) - 1),
		);
		return sizes[index] ?? 0;
	};
	return {
		minBytes: sizes[0] ?? 0,
		maxBytes: sizes[sizes.length - 1] ?? 0,
		p50Bytes: atPercentile(50),
		p95Bytes: atPercentile(95),
		count: sizes.length,
	};
}
