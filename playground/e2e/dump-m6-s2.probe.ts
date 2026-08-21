import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EMBED_ID = "bidi-rtl-embed";
const LATIN_MID = 8;
const ARTIFACT_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	"artifacts",
);

/**
 * Evidence-only M6 offset dump. Run with the conformance config:
 *   pnpm exec playwright test --config packages/tooling/conformance/playwright.config.ts playground/e2e/dump-m6-s2.probe.ts
 */
test("dump M6 Backspace S2 offsets", async ({ page, browserName }) => {
	await page.goto("/");
	await expect(page.locator("[data-pen-inline-content]").first()).toBeVisible();
	await page.evaluate(() => {
		window.__penConformance.load("bidi-mixed");
	});
	await expect
		.poll(async () => {
			return page.evaluate((id) => {
				const block = document.querySelector(`[data-block-id="${id}"]`);
				return block?.getAttribute("dir") ?? "missing";
			}, EMBED_ID);
		})
		.toBe("rtl");

	const clickPoint = await page.evaluate(
		({ blockId, offset }) => {
			const block = document.querySelector(`[data-block-id="${blockId}"]`);
			const inline = block?.querySelector("[data-pen-inline-content]");
			if (!(inline instanceof HTMLElement)) {
				throw new Error("missing inline");
			}
			const walker = document.createTreeWalker(
				inline,
				NodeFilter.SHOW_TEXT,
			);
			let remaining = offset;
			let node: Text | null = null;
			let nodeOffset = 0;
			while (walker.nextNode()) {
				const current = walker.currentNode;
				if (!(current instanceof Text)) continue;
				if (remaining <= current.data.length) {
					node = current;
					nodeOffset = remaining;
					break;
				}
				remaining -= current.data.length;
			}
			if (!node) {
				throw new Error("missing text node");
			}
			const range = document.createRange();
			if (nodeOffset < node.data.length) {
				range.setStart(node, nodeOffset);
				range.setEnd(node, nodeOffset + 1);
				const rect = range.getBoundingClientRect();
				return { x: rect.left + 1, y: rect.top + rect.height / 2 };
			}
			range.setStart(node, Math.max(0, nodeOffset - 1));
			range.setEnd(node, nodeOffset);
			const rect = range.getBoundingClientRect();
			return { x: rect.right - 1, y: rect.top + rect.height / 2 };
		},
		{ blockId: EMBED_ID, offset: LATIN_MID },
	);
	await page.mouse.click(clickPoint.x, clickPoint.y);
	await expect
		.poll(async () => {
			const selection = await page.evaluate(
				() => window.__penConformance.selection,
			);
			if (selection?.type !== "text") {
				return "not-text";
			}
			return `${selection.focus.blockId}:${selection.focus.offset}`;
		})
		.toBe(`${EMBED_ID}:${LATIN_MID}`);

	await page.keyboard.press("Backspace");

	const record = await page.evaluate(() => {
		const s2 = window.__penConformance.domMatchesAuthority();
		return {
			documentText: window.__penConformance.documentText,
			selection: window.__penConformance.selection,
			s2,
		};
	});

	const payload = {
		browserName,
		capturedAt: new Date().toISOString(),
		clickedOffset: LATIN_MID,
		...record,
	};
	mkdirSync(ARTIFACT_DIR, { recursive: true });
	writeFileSync(
		join(ARTIFACT_DIR, `${browserName}-m6-s2.json`),
		`${JSON.stringify(payload, null, 2)}\n`,
	);
	await test.info().attach(`${browserName}-m6-s2`, {
		body: JSON.stringify(payload, null, 2),
		contentType: "application/json",
	});
});
