import { expect, test } from "@playwright/test";
import {
	captureOverlayEvidence,
	openPlayground,
	selectEditorTextRange,
	selectNativeInlineRange,
} from "./helpers";

test.beforeEach(async ({ page }) => {
	await openPlayground(page);
});

test("opens and closes the playground inline session from a text selection", async ({
	page,
}) => {
	const firstInline = page.locator("[data-pen-inline-content]").first();
	await firstInline.click();
	await page.keyboard.type("Alpha bravo charlie delta echo");

	const blockId = await page
		.locator("[data-pen-editor-block]")
		.first()
		.getAttribute("data-block-id");
	expect(blockId).toBeTruthy();

	await selectNativeInlineRange(page, blockId!, 6, 11);
	await selectEditorTextRange(
		page,
		{ blockId: blockId!, offset: 6 },
		{ blockId: blockId!, offset: 11 },
	);

	const aiButton = page.getByRole("button", { name: "AI" });
	await expect(aiButton).toBeEnabled();
	await aiButton.click();

	const promptInput = page.locator(
		".playground-inline-session [data-pen-ai-inline-session-input]",
	);
	await expect(promptInput).toBeVisible();
	const overlay = await captureOverlayEvidence(page);
	expect(overlay.overlapToolbar).toBe(false);
	expect(overlay.prompt?.top ?? -1).toBeGreaterThanOrEqual(
		overlay.toolbar?.bottom ?? 0,
	);
	await promptInput.click();
	await expect(promptInput).toBeFocused();

	await promptInput.press("Escape");
	await expect(promptInput).toHaveCount(0);
});
