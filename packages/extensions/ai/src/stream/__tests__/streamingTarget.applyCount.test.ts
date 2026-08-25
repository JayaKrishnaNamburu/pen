import { streamingTargetFacet } from "@input/pen-core";
import type { DocumentOp, StreamingTarget } from "@input/pen-types";
import { createTestEditor } from "@input/pen-test";
import { afterEach, describe, expect, it } from "vitest";

import { deltaStreamExtension } from "../deltaStreamExtension";

const editors: Array<{ destroy: () => Promise<void> | void }> = [];

afterEach(async () => {
	while (editors.length > 0) {
		await editors.pop()!.destroy();
	}
});

function visibleText(text: string): string {
	return text.replace(/\u200B/g, "");
}

function expectedTokens(count: number): string {
	let text = "";
	for (let i = 0; i < count; i++) {
		text += `token-${i} `;
	}
	return text;
}

async function createCountingEditor() {
	const editor = createTestEditor({
		blocks: [{ type: "paragraph" }],
		extensions: [deltaStreamExtension()],
	});
	editors.push(editor);
	await editor.whenReady();

	let applyCount = 0;
	const applyOps: DocumentOp[][] = [];
	const originalApply = editor.apply.bind(editor);
	editor.apply = ((ops: DocumentOp[], applyOptions) => {
		applyCount += 1;
		applyOps.push(ops);
		originalApply(ops, applyOptions);
	}) as typeof editor.apply;

	const streaming = editor.facet(streamingTargetFacet) as
		| StreamingTarget
		| null;
	if (!streaming) {
		throw new Error("missing streaming target");
	}

	return {
		editor,
		streaming,
		blockId: editor.document.blockOrder.get(0),
		applyCount: () => applyCount,
		applyOps,
	};
}

describe("@input/pen-ai/stream StreamingTarget apply cardinality", () => {
	it("coalesces 1000 appendDeltas into one apply when the flush window does not elapse", async () => {
		const { editor, streaming, blockId, applyCount, applyOps } =
			await createCountingEditor();

		streaming.beginStreaming("bench-zone", blockId);
		for (let i = 0; i < 1000; i++) {
			streaming.appendDelta(`token-${i} `);
		}
		expect(applyCount()).toBe(0);

		streaming.endStreaming("complete");
		expect(applyCount()).toBe(1);
		expect(applyOps[0]).toEqual([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: expectedTokens(1000),
			},
		]);
		expect(visibleText(editor.getBlock(blockId).textContent())).toBe(
			expectedTokens(1000),
		);
	});
});
