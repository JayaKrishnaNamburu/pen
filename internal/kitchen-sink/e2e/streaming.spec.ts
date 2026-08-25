import { expect, test } from "@playwright/test";
import { openPlayground } from "./helpers";

test.beforeEach(async ({ page }) => {
	await openPlayground(page);
});

test("streams tokens into the first block through delta-stream", async ({
	page,
}) => {
	const firstInline = page.locator("[data-pen-inline-content]").first();
	const blockId = await page
		.locator("[data-pen-editor-block]")
		.first()
		.getAttribute("data-block-id");
	expect(blockId).toBeTruthy();

	await page.evaluate((targetBlockId) => {
		const editor = window.penPlayground?.editor;
		if (!editor) {
			throw new Error("Missing playground editor debug handle.");
		}
		const streaming = editor.internals.getSlot<{
			beginStreaming(zoneId: string, blockId: string): void;
			appendDelta(delta: string): void;
			endStreaming(status: "complete"): void;
		}>("delta-stream:target");
		if (!streaming) {
			throw new Error("Missing delta-stream:target slot.");
		}
		streaming.beginStreaming("e2e-stream", targetBlockId);
		streaming.appendDelta("alpha ");
		streaming.appendDelta("beta");
		streaming.endStreaming("complete");
	}, blockId!);

	await expect(firstInline).toHaveText("alpha beta");
});
