import { expect, type Page } from "@playwright/test";
import {
	BIDI_RTL_EMBED_ID,
	BIDI_RTL_EMBED_TEXT,
	BIDI_RTL_LATIN_MID,
} from "../fixtures/bidi";
import { getInlineOffsetPoint } from "../src/domGeometry";
import { scenario } from "../src/scenario";
import { assertDomAuthorityResult } from "../src/standingAssertions";

async function assertRtlEmbed(page: Page): Promise<void> {
	await expect
		.poll(async () => {
			return page.evaluate(
				({ id, text }) => {
					const block = document.querySelector(`[data-block-id="${id}"]`);
					if (!(block instanceof HTMLElement)) {
						return "missing-block";
					}
					const content =
						block.querySelector("[data-pen-inline-content]")?.textContent ??
						"";
					if (!content.includes(text)) {
						return `text:${content}`;
					}
					if (!/[\u0600-\u06FF]/.test(content) || !/[A-Za-z]/.test(content)) {
						return `not-mixed:${content}`;
					}
					if (block.getAttribute("dir") !== "rtl") {
						return `dir:${block.getAttribute("dir")}`;
					}
					return "ok";
				},
				{ id: BIDI_RTL_EMBED_ID, text: BIDI_RTL_EMBED_TEXT },
			);
		})
		.toBe("ok");
}

async function clickOffset(page: Page, offset: number): Promise<void> {
	const point = await getInlineOffsetPoint(page, {
		blockId: BIDI_RTL_EMBED_ID,
		offset,
	});
	await page.mouse.click(point.x, point.y);
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
		.toBe(`${BIDI_RTL_EMBED_ID}:${offset}`);
}

async function documentText(page: Page): Promise<string> {
	return page.evaluate(() => window.__penConformance.documentText);
}

scenario(
	"M6: Backspace on an RTL mixed block deletes the previous logical grapheme (no swap)",
	async (s, page) => {
		await s.load("bidi-mixed");
		await assertRtlEmbed(page);
		await clickOffset(page, BIDI_RTL_LATIN_MID);
		await page.keyboard.press("Backspace");

		const text = await documentText(page);
		const s2 = await page.evaluate(() =>
			window.__penConformance.domMatchesAuthority(),
		);
		expect(
			text,
			`M6: Backspace mid-Hello must stay deleteBackward (drop e). text=${JSON.stringify(text)} s2=${JSON.stringify(s2)}`,
		).toContain("مرحبا Hllo");
		expect(text).not.toContain("مرحبا Helo");
		assertDomAuthorityResult(s2);
	},
);

scenario(
	"M6: Delete on an RTL mixed block deletes the next logical grapheme (no swap)",
	async (s, page) => {
		await s.load("bidi-mixed");
		await assertRtlEmbed(page);
		await clickOffset(page, BIDI_RTL_LATIN_MID);
		await s.keyboard.press("Delete");

		const text = await documentText(page);
		expect(
			text,
			`M6: Delete mid-Hello must stay deleteForward (drop first l). text=${JSON.stringify(text)}`,
		).toContain("مرحبا Helo");
		expect(text).not.toContain("مرحبا Hllo");
	},
);
