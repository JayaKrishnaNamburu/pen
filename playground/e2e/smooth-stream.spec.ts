import { expect, test, type Page } from "@playwright/test";
import { openPlayground } from "./penPlayground.utils";

const PREFIX = "Visible prefix. ";
const WITHHELD = "The withheld clause arrives in one burst.";

/**
 * ST7 / ST8 / ST9: paced reveal. Document text is complete; paint withholds
 * past a per-block frontier (`omitFromRender` / `data-pen-omit-from-render`)
 * until `revealNext` / `flush`.
 */
test.describe("ST7 / ST8 / ST9 paced reveal", () => {
	test("withholds document text from the rendered DOM until reveal and flush", async ({
		page,
	}) => {
		await openPlayground(page);

		await expect
			.poll(async () =>
				page.evaluate(() => window.penPlayground?.smoothStream != null),
			)
			.toBe(true);

		const { blockId, documentText } = await page.evaluate(
			({ prefix, withheld }) => {
				const playground = window.penPlayground;
				const editor = playground?.editor;
				const smooth = playground?.smoothStream;
				if (!editor || !smooth) {
					throw new Error("playground smooth stream is not ready");
				}

				smooth.setEnabled(true);
				smooth.flush();

				const order = editor.documentState.blockOrder.slice();
				const keepId = order[0];
				if (!keepId) {
					throw new Error("document has no blocks");
				}
				const first = editor.getBlock(keepId);
				if (!first) {
					throw new Error("missing first block");
				}

				const ops = [];
				for (const id of order.slice(1)) {
					ops.push({ type: "delete-block" as const, blockId: id });
				}
				ops.push({
					type: "set-props" as const,
					blockId: keepId,
					props: { type: "paragraph" },
				});
				ops.push({
					type: "splice-text" as const,
					blockId: keepId,
					from: 0,
					to: first.length(),
					insert: `${prefix}${withheld}`,
				});
				editor.apply(ops, { origin: "system" });
				smooth.hide(keepId, prefix.length);

				return {
					blockId: keepId,
					documentText: editor.getBlock(keepId)?.textContent() ?? "",
				};
			},
			{ prefix: PREFIX, withheld: WITHHELD },
		);

		expect(documentText).toBe(`${PREFIX}${WITHHELD}`);

		const block = page.locator(`[data-block-id="${blockId}"]`);
		await expect(block).toBeVisible();

		await expect
			.poll(async () => readVisibleAndOmitted(page, blockId))
			.toMatchObject({
				hasWithheldInDocument: true,
				showsWithheld: false,
			});

		await page.evaluate(() => {
			const smooth = window.penPlayground?.smoothStream;
			if (!smooth) {
				throw new Error("smooth stream controller is missing");
			}
			smooth.revealNext();
		});

		await expect
			.poll(async () => {
				const state = await readVisibleAndOmitted(page, blockId);
				return state.visible.includes("The") || state.showsWithheld;
			})
			.toBe(true);

		await page.evaluate(() => {
			window.penPlayground?.smoothStream?.flush();
		});

		await expect
			.poll(async () => readVisibleAndOmitted(page, blockId))
			.toMatchObject({
				showsWithheld: true,
				omitCount: 0,
			});
	});
});

async function readVisibleAndOmitted(
	page: Page,
	blockId: string,
): Promise<{
	visible: string;
	documentText: string;
	omitCount: number;
	showsWithheld: boolean;
	hasWithheldInDocument: boolean;
}> {
	const visible = await page
		.locator(`[data-block-id="${blockId}"] [data-pen-inline-content]`)
		.innerText();
	const omitCount = await page
		.locator(`[data-block-id="${blockId}"] [data-pen-omit-from-render]`)
		.count();
	const documentText = await page.evaluate((id) => {
		const block = window.penPlayground?.editor.getBlock(id);
		if (!block) {
			throw new Error(`missing block ${id}`);
		}
		return block.textContent();
	}, blockId);

	return {
		visible,
		documentText,
		omitCount,
		showsWithheld: visible.includes("withheld clause"),
		hasWithheldInDocument: documentText.includes(WITHHELD),
	};
}
