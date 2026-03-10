import type { PenDocument } from "@pen/types";
import { deepEqual } from "@pen/core";
import type { TestBlock, TestEditor } from "./types";

class PenAssertionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PenAssertionError";
	}
}

function extractBlocks(
	source: TestEditor | { document: PenDocument },
): TestBlock[] {
	const doc = source.document;
	const result: TestBlock[] = [];

	for (let i = 0; i < doc.blockOrder.length; i++) {
		const id = doc.blockOrder.get(i);
		const blockMap = doc.blocks.get(id) as any;
		if (!blockMap) continue;

		const type = blockMap.get("type") as string;
		const propsMap = blockMap.get("props") as any;
		const content = blockMap.get("content");

		const block: TestBlock = { type };
		if (propsMap && propsMap.size > 0) {
			block.props = {};
			for (const [key, value] of propsMap.entries()) {
				block.props[key] = value;
			}
		}
		if (content && typeof content.toString === "function") {
			const text = content.toString();
			if (text && text !== "\u200B") {
				block.content = text;
			}
		}
		result.push(block);
	}
	return result;
}

function compareBlock(
	actual: TestBlock,
	expected: TestBlock,
	index: number,
): void {
	if (actual.type !== expected.type) {
		throw new PenAssertionError(
			`Block ${index}: type mismatch -- got "${actual.type}", expected "${expected.type}"`,
		);
	}

	if (expected.props) {
		for (const [key, value] of Object.entries(expected.props)) {
			const actualValue = actual.props?.[key];
			if (!deepEqual(actualValue, value)) {
				throw new PenAssertionError(
					`Block ${index} (${actual.type}): prop "${key}" mismatch -- ` +
						`got ${JSON.stringify(actualValue)}, expected ${JSON.stringify(value)}`,
				);
			}
		}
	}

	if (expected.content !== undefined) {
		if ((actual.content ?? "") !== expected.content) {
			throw new PenAssertionError(
				`Block ${index} (${actual.type}): content mismatch -- ` +
					`got "${actual.content ?? ""}", expected "${expected.content}"`,
			);
		}
	}
}

export function assertDocEquals(
	editorOrA: TestEditor | { document: PenDocument },
	expectedOrB: TestBlock[] | TestEditor | { document: PenDocument },
): void {
	const blocksA = extractBlocks(editorOrA);
	const blocksB = Array.isArray(expectedOrB)
		? expectedOrB
		: extractBlocks(expectedOrB);

	if (blocksA.length !== blocksB.length) {
		throw new PenAssertionError(
			`Document length mismatch: got ${blocksA.length} blocks, expected ${blocksB.length}`,
		);
	}

	for (let i = 0; i < blocksA.length; i++) {
		compareBlock(blocksA[i], blocksB[i], i);
	}
}
