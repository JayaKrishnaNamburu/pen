import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { toolsExtension } from "@input/pen-tools";
import { defaultSchema } from "@input/pen-schema";
import { undoExtension } from "@input/pen-undo";
import { refuseStaleEditDocumentCall } from "../runtime/viewHashes";

/**
 * UC4: fingerprints are the only edit gate. The revision counter is gone
 * from this package — GATE 3.9 greps for `getBlockRevision`; this file
 * claims the behavior that grep cannot see.
 */

const AI_SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function seedEditor() {
	const editor = createEditor({
		schema: defaultSchema,
		extensions: [undoExtension(), toolsExtension()],
	});
	const headingId = editor.firstBlock()!.id;
	editor.apply(
		[
			{
				type: "set-props",
				blockId: headingId,
				props: { type: "heading", level: 1 },
			},
			{
				type: "splice-text",
				blockId: headingId,
				from: 0,
				to: 0,
				insert: "Quarterly Report",
			},
		],
		{ origin: "system" },
	);
	return { editor, headingId };
}

describe("UC4: stale edits refuse on fingerprint mismatch", () => {
	it("UC4: no edit-gating source consults a revision counter", () => {
		const gatingFiles = [
			"helpers/operations.ts",
			"helpers/operationFactories.ts",
			"controller/workingSetValidationMethods.ts",
			"runtime/viewHashes.ts",
			"agentic/loop.ts",
		];
		for (const relative of gatingFiles) {
			const source = readFileSync(join(AI_SRC, relative), "utf8");
			expect(
				source.includes("getBlockRevision"),
				`${relative} still consults the revision counter`,
			).toBe(false);
		}
	});

	it("UC4: a view-hash mismatch refuses the edit and applies nothing", () => {
		const { editor, headingId } = seedEditor();
		try {
			const refusal = refuseStaleEditDocumentCall(
				editor,
				{
					operations: [
						{
							operation: "replace_block_text",
							blockId: headingId,
							text: "Rewritten.",
						},
					],
				},
				{ [headingId]: "stale-hash-from-a-prior-read" },
				"resolved",
			);

			expect(refusal).not.toBeNull();
			expect(refusal?.ok).toBe(false);
			expect(refusal?.appliedOperations).toEqual([]);
			expect(refusal?.rejected[0]?.reason).toContain("view-changed");
			expect(editor.getBlock(headingId)?.textContent()).toBe(
				"Quarterly Report",
			);
		} finally {
			editor.destroy();
		}
	});

	it("UC4: a matching view hash is not a stale refusal", () => {
		const { editor, headingId } = seedEditor();
		try {
			const live = refuseStaleEditDocumentCall(
				editor,
				{
					operations: [
						{
							operation: "replace_block_text",
							blockId: headingId,
							text: "Rewritten.",
						},
					],
				},
				undefined,
				"resolved",
			);
			expect(live).toBeNull();
		} finally {
			editor.destroy();
		}
	});
});
