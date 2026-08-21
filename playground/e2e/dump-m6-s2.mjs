import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "@playwright/test";

const EMBED_ID = "bidi-rtl-embed";
const LATIN_MID = 8;
const ARTIFACT_DIR = join(dirname(fileURLToPath(import.meta.url)), "artifacts");
const HARNESS = "http://127.0.0.1:4174";

const engines = [
	["chromium", chromium],
	["webkit", webkit],
	["firefox", firefox],
];

mkdirSync(ARTIFACT_DIR, { recursive: true });

for (const [name, factory] of engines) {
	const browser = await factory.launch();
	const page = await browser.newPage();
	await page.goto(HARNESS);
	await page.locator("[data-pen-inline-content]").first().waitFor();
	await page.evaluate(() => window.__penConformance.load("bidi-mixed"));
	await page.waitForFunction(
		(id) => document.querySelector(`[data-block-id="${id}"]`)?.getAttribute("dir") === "rtl",
		EMBED_ID,
	);
	const clickPoint = await page.evaluate(
		({ blockId, offset }) => {
			const block = document.querySelector(`[data-block-id="${blockId}"]`);
			const inline = block?.querySelector("[data-pen-inline-content]");
			if (!(inline instanceof HTMLElement)) throw new Error("missing inline");
			const walker = document.createTreeWalker(inline, NodeFilter.SHOW_TEXT);
			let remaining = offset;
			let node = null;
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
			if (!node) throw new Error("missing text");
			const range = document.createRange();
			range.setStart(node, nodeOffset);
			range.setEnd(node, Math.min(nodeOffset + 1, node.data.length));
			const rect = range.getBoundingClientRect();
			return { x: rect.left + 1, y: rect.top + rect.height / 2 };
		},
		{ blockId: EMBED_ID, offset: LATIN_MID },
	);
	await page.mouse.click(clickPoint.x, clickPoint.y);
	await page.waitForFunction(
		({ id, offset }) => {
			const selection = window.__penConformance.selection;
			return (
				selection?.type === "text" &&
				selection.focus.blockId === id &&
				selection.focus.offset === offset
			);
		},
		{ id: EMBED_ID, offset: LATIN_MID },
	);
	await page.keyboard.press("Backspace");
	const record = await page.evaluate(() => ({
		documentText: window.__penConformance.documentText,
		selection: window.__penConformance.selection,
		s2: window.__penConformance.domMatchesAuthority(),
	}));
	const payload = {
		browserName: name,
		capturedAt: new Date().toISOString(),
		clickedOffset: LATIN_MID,
		...record,
	};
	writeFileSync(
		join(ARTIFACT_DIR, `${name}-m6-s2.json`),
		`${JSON.stringify(payload, null, 2)}\n`,
	);
	console.log(name, JSON.stringify(payload.s2), payload.documentText);
	await browser.close();
}
