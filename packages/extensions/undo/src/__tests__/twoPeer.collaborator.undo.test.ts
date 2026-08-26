import { createTwoPeerHarness } from "@input/pen-test";
import type { CommitEvent } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { undoExtension } from "../undoExtension";

function visibleText(text: string): string {
	return text.replace(/\u200B/g, "");
}

describe("@input/pen-undo two-peer collaborator isolation", () => {
	it("peer B's synced edit is not undone on peer A", () => {
		const harness = createTwoPeerHarness({
			blocks: [{ id: "b1", type: "paragraph", content: "Hello" }],
			extensions: [undoExtension({ groupTimeout: 0 })],
		});

		harness.peerA.editor.apply(
			[{ type: "splice-text", blockId: "b1", from: 5,
				to: 5,
				insert: " local" }],
			{ origin: "user" },
		);
		harness.exchange("a-then-b");
		harness.assertConverged();
		expect(
			visibleText(harness.peerB.editor.getBlock("b1").textContent()),
		).toBe("Hello local");
		expect(
			visibleText(harness.peerA.editor.getBlock("b1").textContent()),
		).toBe("Hello local");

		harness.peerB.editor.apply(
			[
				{
					type: "splice-text",
					blockId: "b1",
					from: 11,
				to: 11,
				insert: " remote",
				},
			],
			{ origin: "user" },
		);
		harness.exchange("b-then-a");
		harness.assertConverged();
		expect(
			visibleText(harness.peerA.editor.getBlock("b1").textContent()),
		).toBe("Hello local remote");

		expect(harness.peerA.editor.undoManager.undo()).toBe(true);
		expect(
			visibleText(harness.peerA.editor.getBlock("b1").textContent()),
		).toBe("Hello remote");
		expect(harness.peerA.editor.undoManager.undo()).toBe(false);
		expect(
			visibleText(harness.peerA.editor.getBlock("b1").textContent()),
		).toBe("Hello remote");

		harness.exchange("a-then-b");
		harness.assertConverged();
		expect(
			visibleText(harness.peerB.editor.getBlock("b1").textContent()),
		).toBe("Hello remote");

		harness.destroy();
	});

	it("a remote-only peer B edit is not locally undoable on peer A", () => {
		const harness = createTwoPeerHarness({
			blocks: [{ id: "b1", type: "paragraph", content: "Hello" }],
			extensions: [undoExtension({ groupTimeout: 0 })],
		});
		const remoteOrigins: string[] = [];
		harness.peerA.editor.on("commit", (event: CommitEvent) => {
			if (event.source === "remote") {
				remoteOrigins.push(event.origin.type);
			}
		});

		harness.peerB.editor.apply(
			[
				{
					type: "splice-text",
					blockId: "b1",
					from: 5,
				to: 5,
				insert: " from-b",
				},
			],
			{ origin: "user" },
		);
		harness.exchange("b-then-a");
		harness.assertConverged();
		expect(
			visibleText(harness.peerB.editor.getBlock("b1").textContent()),
		).toBe("Hello from-b");
		expect(
			visibleText(harness.peerA.editor.getBlock("b1").textContent()),
		).toBe("Hello from-b");
		expect(remoteOrigins.length).toBeGreaterThan(0);
		expect(remoteOrigins.every((type) => type === "collaborator")).toBe(
			true,
		);
		expect(remoteOrigins).not.toContain("user");

		expect(harness.peerA.editor.undoManager.canUndo()).toBe(false);
		expect(harness.peerA.editor.undoManager.undo()).toBe(false);
		expect(
			visibleText(harness.peerA.editor.getBlock("b1").textContent()),
		).toBe("Hello from-b");

		harness.destroy();
	});
});
