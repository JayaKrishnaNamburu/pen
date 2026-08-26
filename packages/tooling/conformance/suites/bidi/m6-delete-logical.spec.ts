import { expect } from "@playwright/test";
import { formatCheckReport } from "../../src/checkReport";
import { scenario } from "../../src/scenario";
import {
	attachJson,
	clickOffset,
	expectS2Matched,
	logLoad,
	readBlockText,
	readCaret,
	readS2,
} from "./helpers";

const M6_BLOCK_ID = "m6-delete-rtl";
const M6_TEXT = "ab";

scenario(
	"M6: Backspace in an RTL block deletes the previous logical grapheme (no swap)",
	async (s, page) => {
		const loads = logLoad("M6-backspace");
		await s.load("hello-world");
		await s.apply([
			{
				type: "insert-block",
				blockId: M6_BLOCK_ID,
				blockType: "paragraph",
				props: { direction: "rtl" },
				position: "last",
			},
			{
				type: "splice-text",
				blockId: M6_BLOCK_ID,
				from: 0,
				to: 0,
				insert: M6_TEXT,
			},
		]);
		await expect(page.locator(`[data-block-id="${M6_BLOCK_ID}"]`)).toBeVisible();
		await clickOffset(page, M6_BLOCK_ID, 1);
		await page.keyboard.press("Backspace");
		const text = await readBlockText(page, M6_BLOCK_ID);
		const caret = await readCaret(page);
		const s2 = await readS2(page);
		await attachJson("m6-backspace", { loads, text, caret, s2 });

		expectS2Matched(s2, "M6: S2 after Backspace");
		expect(
			text,
			formatCheckReport(
				"M6: Backspace removes the previous logical grapheme, not the next",
				text === "b" ? "passed" : "failed",
				`text=${JSON.stringify(text)} expected "b" (swap would leave "a")`,
			),
		).toBe("b");
		expect(
			caret?.offset,
			formatCheckReport(
				"M6: caret stays at the deletion point",
				caret?.offset === 0 ? "passed" : "failed",
				`offset ${caret?.offset ?? "null"}`,
			),
		).toBe(0);
	},
);

scenario(
	"M6: Delete in an RTL block deletes the next logical grapheme (no swap)",
	async (s, page) => {
		const loads = logLoad("M6-delete");
		await s.load("hello-world");
		await s.apply([
			{
				type: "insert-block",
				blockId: M6_BLOCK_ID,
				blockType: "paragraph",
				props: { direction: "rtl" },
				position: "last",
			},
			{
				type: "splice-text",
				blockId: M6_BLOCK_ID,
				from: 0,
				to: 0,
				insert: M6_TEXT,
			},
		]);
		await expect(page.locator(`[data-block-id="${M6_BLOCK_ID}"]`)).toBeVisible();
		await clickOffset(page, M6_BLOCK_ID, 0);
		await page.keyboard.press("Delete");
		const text = await readBlockText(page, M6_BLOCK_ID);
		const caret = await readCaret(page);
		const s2 = await readS2(page);
		await attachJson("m6-delete", { loads, text, caret, s2 });

		expectS2Matched(s2, "M6: S2 after Delete");
		expect(
			text,
			formatCheckReport(
				"M6: Delete removes the next logical grapheme, not the previous",
				text === "b" ? "passed" : "failed",
				`text=${JSON.stringify(text)} expected "b" (swap would leave "a")`,
			),
		).toBe("b");
		expect(
			caret?.offset,
			formatCheckReport(
				"M6: caret stays at the deletion point",
				caret?.offset === 0 ? "passed" : "failed",
				`offset ${caret?.offset ?? "null"}`,
			),
		).toBe(0);
	},
);
