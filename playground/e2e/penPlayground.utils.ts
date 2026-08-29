import { expect, type Page } from "@playwright/test";
import type { InlineDelta, SelectionState } from "@input/pen-types";

export const MODIFIER = process.platform === "darwin" ? "Meta" : "Control";

export async function openPlayground(page: Page): Promise<void> {
	await page.goto("/");
	await expect(page.locator(".editor-pane")).toBeVisible();
	await expect
		.poll(async () =>
			page.evaluate(() => Boolean(window.penPlayground?.editor)),
		)
		.toBe(true);
}

export async function replaceWithMentionParagraph(
	page: Page,
): Promise<{ blockId: string }> {
	const blockId = await page.evaluate(() => {
		const editor = window.penPlayground?.editor;
		if (!editor) {
			throw new Error("playground editor is not ready");
		}
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
			insert: [
				"hello ",
				{
					nodeType: "mention",
					props: { id: "user-1", label: "Ada" },
				},
				" world",
			],
		});
		editor.apply(ops, { origin: "system" });
		return keepId;
	});
	await expect(
		page.locator(
			`[data-block-id="${blockId}"] [data-pen-inline-atom-type="mention"]`,
		),
	).toBeVisible();
	return { blockId };
}

export async function replaceWithParagraphThenNonText(
	page: Page,
	nonText: { blockId: string; blockType: "image" | "table" | "divider" },
): Promise<{ paragraphId: string; nonTextId: string }> {
	const ids = await page.evaluate((next) => {
		const editor = window.penPlayground?.editor;
		if (!editor) {
			throw new Error("playground editor is not ready");
		}
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
			insert: "Above the line",
		});
		ops.push({
			type: "insert-block" as const,
			blockId: next.blockId,
			blockType: next.blockType,
			props: {},
			position: { after: keepId },
		});
		editor.apply(ops, { origin: "system" });
		return { paragraphId: keepId, nonTextId: next.blockId };
	}, nonText);
	await expect(
		page.locator(`[data-block-id="${ids.paragraphId}"]`),
	).toBeVisible();
	await expect(page.locator(`[data-block-id="${ids.nonTextId}"]`)).toBeVisible();
	return ids;
}

export async function readSelection(
	page: Page,
): Promise<SelectionState | null> {
	return page.evaluate(() => {
		const selection = window.penPlayground?.editor.selection ?? null;
		return selection === null ? null : structuredClone(selection);
	});
}

export async function readInlineDeltas(
	page: Page,
	blockId: string,
): Promise<InlineDelta[]> {
	return page.evaluate((id) => {
		const block = window.penPlayground?.editor.getBlock(id);
		if (!block) {
			throw new Error(`missing block ${id}`);
		}
		return structuredClone(block.inlineDeltas());
	}, blockId);
}

export async function readFirstBlockInlineDeltas(
	page: Page,
): Promise<InlineDelta[]> {
	return page.evaluate(() => {
		const block = window.penPlayground?.editor.firstBlock();
		if (!block) {
			throw new Error("document has no first block");
		}
		return structuredClone(block.inlineDeltas());
	});
}

export async function readFocusSinkOwnsDocumentFocus(
	page: Page,
): Promise<boolean> {
	return page.evaluate(() => {
		const active = document.activeElement;
		return Boolean(
			active instanceof HTMLElement &&
				active.hasAttribute("data-pen-focus-sink"),
		);
	});
}

export async function clickParagraphText(
	page: Page,
	blockId: string,
): Promise<void> {
	const surface = page.locator(
		`[data-block-id="${blockId}"] [data-pen-inline-content]`,
	);
	await expect(surface).toBeVisible();
	const box = await surface.boundingBox();
	if (!box) {
		throw new Error(`no box for paragraph ${blockId}`);
	}
	await page.mouse.click(box.x + 12, box.y + box.height / 2);
}
