import { expect, type Page } from "@playwright/test";
import { formatCheckReport } from "./checkReport";
import type { PointRef } from "./types";

export async function resolveBlockId(
	page: Page,
	point: PointRef,
): Promise<string> {
	if ("blockId" in point) {
		return point.blockId;
	}
	const blockIds = await page.evaluate(() => window.__penConformance.blockIds);
	const blockId = blockIds[point.block];
	expect(
		blockId,
		formatCheckReport(
			"resolveBlockId",
			blockId ? "passed" : "failed",
			blockId ? undefined : `no block at index ${point.block}`,
		),
	).toBeTruthy();
	return blockId!;
}

export async function getInlineOffsetPoint(
	page: Page,
	point: PointRef,
): Promise<{ x: number; y: number }> {
	const blockId = await resolveBlockId(page, point);
	return page.evaluate(
		({ targetBlockId, targetOffset }) => {
			const blockElement = document.querySelector(
				`[data-block-id="${targetBlockId}"]`,
			);
			if (!(blockElement instanceof HTMLElement)) {
				throw new Error(`Missing block element for ${targetBlockId}`);
			}

			const inlineElement = blockElement.querySelector(
				"[data-pen-inline-content]",
			);
			if (!(inlineElement instanceof HTMLElement)) {
				throw new Error(`Missing inline element for ${targetBlockId}`);
			}

			const walker = document.createTreeWalker(
				inlineElement,
				NodeFilter.SHOW_TEXT,
			);
			let remaining = targetOffset;
			let targetNode: Text | null = null;
			let offsetInNode = 0;
			let lastTextNode: Text | null = null;

			while (walker.nextNode()) {
				const textNode = walker.currentNode;
				if (!(textNode instanceof Text)) {
					continue;
				}
				lastTextNode = textNode;
				const length = textNode.data.length;
				if (remaining <= length) {
					targetNode = textNode;
					offsetInNode = remaining;
					break;
				}
				remaining -= length;
			}

			if (!targetNode) {
				targetNode = lastTextNode;
				offsetInNode = targetNode?.data.length ?? 0;
			}

			if (!targetNode) {
				const rect = inlineElement.getBoundingClientRect();
				return {
					x: rect.left + 4,
					y: rect.top + rect.height / 2,
				};
			}

			const range = document.createRange();
			if (offsetInNode < targetNode.data.length) {
				range.setStart(targetNode, offsetInNode);
				range.setEnd(targetNode, offsetInNode + 1);
				const rect = range.getBoundingClientRect();
				return {
					x: rect.left + 1,
					y: rect.top + rect.height / 2,
				};
			}

			if (offsetInNode > 0) {
				range.setStart(targetNode, offsetInNode - 1);
				range.setEnd(targetNode, offsetInNode);
				const rect = range.getBoundingClientRect();
				return {
					x: rect.right - 1,
					y: rect.top + rect.height / 2,
				};
			}

			const rect = inlineElement.getBoundingClientRect();
			return {
				x: rect.left + 4,
				y: rect.top + rect.height / 2,
			};
		},
		{ targetBlockId: blockId, targetOffset: point.offset },
	);
}
