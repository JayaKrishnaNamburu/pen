import { describe, expect, it } from "vitest";
import { applySplitBlock } from "@input/pen-core";
import { createTwoPeerHarness, type TwoPeerHarness } from "@input/pen-test";
import { toolsExtension } from "@input/pen-tools";
import { undoExtension } from "@input/pen-undo";
import { deltaStreamExtension } from "../stream";
import { aiExtension, getAIController } from "../index";
import { createDeferred } from "./extension.testUtils";

const BLOCK_ID = "b1";

/**
 * Two peers on one document, with a generation rewriting "world" on peer A and
 * parked between its two deltas. Whatever peer B does from here lands while the
 * model still has text to write.
 */
async function startGenerationPausedMidStream() {
	const resume = createDeferred();
	const harness = createTwoPeerHarness({
		blocks: [{ id: BLOCK_ID, type: "paragraph", content: "Hello world" }],
		// the AI extension closes over the controller it activates, so one
		// shared instance would hand both peers the same controller.
		extensionsFor: () => [
			undoExtension(),
			deltaStreamExtension(),
			toolsExtension(),
			aiExtension({
				model: {
					async *stream() {
						yield { type: "text-delta" as const, delta: "Alpha" };
						await resume.promise;
						yield { type: "text-delta" as const, delta: "Beta" };
						yield { type: "done" as const };
					},
				},
			}),
		],
	});
	await harness.peerA.editor.whenReady();
	await harness.peerB.editor.whenReady();

	const editorA = harness.peerA.editor;
	editorA.selectTextRange(
		{ blockId: BLOCK_ID, offset: 6 },
		{ blockId: BLOCK_ID, offset: 11 },
	);
	const controller = getAIController(editorA)!;
	const session = controller.startSession({
		surface: "inline-edit",
		target: "selection",
	});
	const generation = controller.runSessionPrompt(
		session.id,
		"Make it better",
	);
	await waitForText(harness, "a", "Alpha");

	return { harness, generation, resume: resume.resolve };
}

/** Insert ahead of the write head, so every offset the run captured is stale. */
function peerBTypesAtBlockStart(harness: TwoPeerHarness): void {
	harness.peerB.editor.apply(
		[
			{
				type: "splice-text",
				blockId: BLOCK_ID,
				from: 0,
				to: 0,
				insert: "XX",
			},
		],
		{ origin: "user" },
	);
	harness.exchange("b-then-a");
}

function blockText(harness: TwoPeerHarness, peer: "a" | "b"): string {
	return harness
		.peer(peer)
		.editor.getBlock(BLOCK_ID)
		.textContent({ resolved: true });
}

async function waitForText(
	harness: TwoPeerHarness,
	peer: "a" | "b",
	needle: string,
	maxTicks = 50,
): Promise<void> {
	for (let tick = 0; tick < maxTicks; tick += 1) {
		if (blockText(harness, peer).includes(needle)) {
			return;
		}
		await Promise.resolve();
	}
	throw new Error(
		`"${needle}" never reached peer ${peer}: ${blockText(harness, peer)}`,
	);
}

describe("a collaborator editing during a generation", () => {
	it("COL1: a peer's edit to the block being rewritten does not cancel the run", async () => {
		const { harness, generation, resume } =
			await startGenerationPausedMidStream();
		try {
			peerBTypesAtBlockStart(harness);
			resume();

			expect((await generation).status).not.toBe("cancelled");
			expect(blockText(harness, "a")).toContain("XX");
			expect(blockText(harness, "a")).toContain("Alpha");
		} finally {
			harness.destroy();
		}
	});

	it("ST2: a peer's edit moves the write head instead of splitting the streamed text", async () => {
		const { harness, generation, resume } =
			await startGenerationPausedMidStream();
		try {
			peerBTypesAtBlockStart(harness);
			resume();
			await generation;

			// held as an offset plus a running length, the second delta lands
			// two characters early and splits the first.
			expect(blockText(harness, "a")).toBe("XXHello AlphaBeta");

			harness.exchange();
			expect(blockText(harness, "b")).toBe("XXHello AlphaBeta");
			harness.assertConverged();
		} finally {
			harness.destroy();
		}
	});
});

describe("a block split under a streaming rewrite", () => {
	it("AN14: the write head is repaired into the tail block", async () => {
		const { harness, generation, resume } =
			await startGenerationPausedMidStream();
		try {
			const editorA = harness.peerA.editor;
			applySplitBlock(editorA, {
				blockId: BLOCK_ID,
				offset: 3,
				newBlockId: "b1-tail",
				applyOptions: { origin: "system" },
			});
			resume();
			await generation;

			// resolving the head without repairing it first leaves it on the
			// block that kept the old offset, which now ends at "Hel".
			expect(editorA.getBlock(BLOCK_ID).textContent()).toBe("Hel");
			expect(
				editorA.getBlock("b1-tail").textContent({ resolved: true }),
			).toBe("lo AlphaBeta");

			harness.exchange();
			harness.assertConverged();
		} finally {
			harness.destroy();
		}
	});
});
