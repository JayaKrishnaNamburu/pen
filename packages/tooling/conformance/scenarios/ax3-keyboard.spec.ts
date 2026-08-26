import { expect, type Page } from "@playwright/test";
import { scenario } from "../src/scenario";

const AX3_URL = "/?ax3=1";

async function installPointerGuard(page: Page): Promise<void> {
	await page.evaluate(() => {
		const state = { count: 0 };
		(
			window as Window & { __ax3PointerCount?: { count: number } }
		).__ax3PointerCount = state;
		const bump = () => {
			state.count += 1;
		};
		// Enter on a focused <button> synthesizes `click`. That is keyboard
		// activation, not a pointer. Count only pointer/mouse down.
		for (const type of ["pointerdown", "mousedown"] as const) {
			document.addEventListener(type, bump, true);
		}
	});
}

async function assertNoPointerEvents(page: Page): Promise<void> {
	const count = await page.evaluate(
		() =>
			(window as Window & { __ax3PointerCount?: { count: number } })
				.__ax3PointerCount?.count ?? -1,
	);
	expect(count, "AX3 scenarios must not dispatch pointer events").toBe(0);
}

scenario(
	"AX3: slash-menu insertion is keyboard-only and restores field focus",
	async (s, page) => {
		await installPointerGuard(page);
		await s.load("hello-world", { pointer: false });
		const blockId = await page.evaluate(
			() => window.__penConformance.blockIds[0],
		);
		expect(blockId).toBeTruthy();
		await s.apply([
			{
				type: "splice-text",
				blockId: blockId!,
				from: 0,
				to: 0 + 11,
				insert: "",
			},
		]);
		await s.keyboard.type("/head");
		const headingOption = page.locator(
			'[data-pen-slash-menu-item][data-block-type="heading"]',
		);
		await expect(headingOption).toBeVisible();
		await page.keyboard.press("Enter");
		await expect(
			page.locator('[data-pen-editor-block][data-block-type="heading"]'),
		).toBeVisible();
		await expect(page.locator("[data-pen-slash-menu-item]")).toHaveCount(0);
		await s.assert.focusInsideEditor();
		await assertNoPointerEvents(page);
	},
	{ url: AX3_URL },
);

scenario(
	"AX3: autocomplete acceptance is keyboard-only and keeps field focus",
	async (s, page) => {
		await installPointerGuard(page);
		await s.load("hello-world", { pointer: false });
		await page.keyboard.press("End");
		await page.keyboard.press("Tab");
		await expect(
			page.locator("[data-suggestion-text], [data-pen-autocomplete-preview-block]"),
		).toBeVisible();
		await page.keyboard.press("Tab");
		await s.assert.textContains("completion");
		await s.assert.focusInsideEditor();
		await assertNoPointerEvents(page);
	},
	{ url: AX3_URL },
);

scenario(
	"AX3: block reorder via handle menu is keyboard-only and restores handle focus",
	async (s, page) => {
		await installPointerGuard(page);
		await s.load("two-paragraph", { pointer: false });
		await page.evaluate(() => {
			document
				.querySelector<HTMLElement>(
					'[data-pen-block-handle][data-block-id="two-p2"]',
				)
				?.focus();
		});
		await page.keyboard.press("Enter");
		await expect(
			page.locator('[data-pen-command="pen.moveBlockUp"]'),
		).toBeVisible();
		await page.keyboard.press("Enter");
		const order = await page.evaluate(() => window.__penConformance.blockIds);
		expect(order[0]).toBe("two-p2");
		expect(order[1]).toBe("two-p1");
		await expect(page.locator("[data-pen-block-handle-menu]")).toHaveCount(0);
		await s.assert.focusInsideEditor();
		await assertNoPointerEvents(page);
	},
	{ url: AX3_URL },
);

scenario(
	"AX3: table row insertion is keyboard-only and keeps control focus",
	async (s, page) => {
		await installPointerGuard(page);
		await s.load("hello-world", { pointer: false });
		await s.apply([
			{
				type: "insert-block",
				blockId: "ax3-table",
				blockType: "table",
				props: {},
				position: "last",
			},
		]);
		const addRow = page.getByRole("button", { name: "Add row" });
		const rowCount = await page.locator("[data-pen-table-row]").count();
		await page.evaluate(() => {
			document
				.querySelector<HTMLElement>(".pen-table-add-row-control")
				?.focus();
		});
		await page.keyboard.press("Enter");
		await expect(page.locator("[data-pen-table-row]")).toHaveCount(rowCount + 1);
		await expect(addRow).toBeVisible();
		await s.assert.focusInsideEditor();
		await assertNoPointerEvents(page);
	},
	{ url: AX3_URL },
);
