import { expect, type Page } from "@playwright/test";
import { scenario } from "../src/scenario";

async function blockType(page: Page, blockId: string): Promise<string | null> {
	return page.evaluate((id) => {
		const block = document.querySelector(`[data-block-id="${id}"]`);
		return block?.getAttribute("data-block-type") ?? null;
	}, blockId);
}

async function insertBlock(
	page: Page,
	block: { blockId: string; blockType: string },
): Promise<void> {
	await page.evaluate((next) => {
		window.__penConformance.apply([
			{
				type: "insert-block",
				blockId: next.blockId,
				blockType: next.blockType,
				props: {},
				position: "last",
			},
		]);
	}, block);
	await expect(
		page.locator(`[data-block-id="${block.blockId}"]`),
	).toBeVisible();
}

async function focusBlock(page: Page, blockId: string): Promise<void> {
	await page
		.locator(`[data-block-id="${blockId}"] [data-pen-inline-content]`)
		.click();
}

scenario(
	"F39: backspace exits an empty blockquote via beforeinput",
	async (s, page) => {
		await s.load("hello-world");
		await insertBlock(page, {
			blockId: "f39-quote",
			blockType: "blockquote",
		});
		expect(await blockType(page, "f39-quote")).toBe("blockquote");

		await focusBlock(page, "f39-quote");
		await s.keyboard.press("Backspace");

		await expect.poll(() => blockType(page, "f39-quote")).toBe("paragraph");
		await s.assert.selectionEquals({
			anchor: { blockId: "f39-quote", offset: 0 },
			focus: { blockId: "f39-quote", offset: 0 },
		});
		await s.assert.domMatchesAuthority();
	},
);

scenario(
	"F39: backspace exits an empty bullet list item via beforeinput",
	async (s, page) => {
		await s.load("hello-world");
		await insertBlock(page, {
			blockId: "f39-bullet",
			blockType: "bulletListItem",
		});
		expect(await blockType(page, "f39-bullet")).toBe("bulletListItem");

		await focusBlock(page, "f39-bullet");
		await s.keyboard.press("Backspace");

		await expect.poll(() => blockType(page, "f39-bullet")).toBe("paragraph");
		await s.assert.selectionEquals({
			anchor: { blockId: "f39-bullet", offset: 0 },
			focus: { blockId: "f39-bullet", offset: 0 },
		});
		await s.assert.domMatchesAuthority();
	},
);

scenario(
	"F39: converts '3. ' into a numbered list item via beforeinput",
	async (s, page) => {
		await s.load("hello-world");
		await insertBlock(page, {
			blockId: "f39-numbered",
			blockType: "paragraph",
		});
		await focusBlock(page, "f39-numbered");
		await s.keyboard.type("3. ");

		await expect
			.poll(() => blockType(page, "f39-numbered"))
			.toBe("numberedListItem");
		await expect(
			page.locator(
				'[data-pen-list-item-layout][data-block-type="numberedListItem"] [data-pen-list-marker]',
			),
		).toHaveText("3.");
		expect(
			await page.evaluate(() => window.__penConformance.documentText),
		).not.toContain("3.");
		await s.assert.selectionEquals({
			anchor: { blockId: "f39-numbered", offset: 0 },
			focus: { blockId: "f39-numbered", offset: 0 },
		});
		await s.assert.domMatchesAuthority();
	},
);

scenario(
	"F39: converts '[ ] ' into a check list item via beforeinput",
	async (s, page) => {
		await s.load("hello-world");
		await insertBlock(page, {
			blockId: "f39-check",
			blockType: "paragraph",
		});
		await focusBlock(page, "f39-check");
		await s.keyboard.type("[ ] ");

		await expect
			.poll(() => blockType(page, "f39-check"))
			.toBe("checkListItem");
		expect(
			await page.evaluate(() => window.__penConformance.documentText),
		).not.toContain("[ ]");
		await s.assert.selectionEquals({
			anchor: { blockId: "f39-check", offset: 0 },
			focus: { blockId: "f39-check", offset: 0 },
		});
		await s.assert.domMatchesAuthority();
	},
);
