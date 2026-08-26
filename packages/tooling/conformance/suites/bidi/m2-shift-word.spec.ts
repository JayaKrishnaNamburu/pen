import { expect } from "@playwright/test";
import {
	BIDI_RTL_EMBED_ID,
	BIDI_RTL_EMBED_TEXT,
	BIDI_RTL_LATIN_MID,
	BIDI_RTL_LATIN_START,
} from "../../fixtures/bidi";
import { formatCheckReport } from "../../src/checkReport";
import { scenario } from "../../src/scenario";
import {
	attachJson,
	clickOffset,
	expectS2Matched,
	logLoad,
	readCaret,
	readS2,
} from "./helpers";

const WORD_LEFT = process.platform === "darwin" ? "Alt+ArrowLeft" : "Control+ArrowLeft";
const WORD_RIGHT = process.platform === "darwin" ? "Alt+ArrowRight" : "Control+ArrowRight";

scenario(
	"M2: Shift-ArrowLeft on RTL extends logical forward (extend variant swap)",
	async (s, page) => {
		const loads = logLoad("M2-shift-left");
		await s.load("bidi-mixed");
		await clickOffset(page, BIDI_RTL_EMBED_ID, BIDI_RTL_LATIN_MID);
		await page.keyboard.press("Shift+ArrowLeft");
		const caret = await readCaret(page);
		const s2 = await readS2(page);
		await attachJson("m2-shift-left", { loads, caret, s2 });

		expectS2Matched(s2, "M2: S2 after Shift-ArrowLeft");
		expect(
			caret,
			formatCheckReport(
				"M2: Shift-ArrowLeft on rtl extends logical forward",
				caret &&
					!caret.isCollapsed &&
					caret.anchorOffset === BIDI_RTL_LATIN_MID &&
					caret.focusOffset === BIDI_RTL_LATIN_MID + 1
					? "passed"
					: "failed",
				`caret=${JSON.stringify(caret)}`,
			),
		).toMatchObject({
			blockId: BIDI_RTL_EMBED_ID,
			isCollapsed: false,
			anchorOffset: BIDI_RTL_LATIN_MID,
			focusOffset: BIDI_RTL_LATIN_MID + 1,
		});
	},
);

scenario(
	"M2: Shift-ArrowRight on RTL extends logical backward (extend variant swap)",
	async (s, page) => {
		const loads = logLoad("M2-shift-right");
		await s.load("bidi-mixed");
		await clickOffset(page, BIDI_RTL_EMBED_ID, BIDI_RTL_LATIN_MID);
		await page.keyboard.press("Shift+ArrowRight");
		const caret = await readCaret(page);
		const s2 = await readS2(page);
		await attachJson("m2-shift-right", { loads, caret, s2 });

		expectS2Matched(s2, "M2: S2 after Shift-ArrowRight");
		expect(
			caret,
			formatCheckReport(
				"M2: Shift-ArrowRight on rtl extends logical backward",
				caret &&
					!caret.isCollapsed &&
					caret.anchorOffset === BIDI_RTL_LATIN_MID &&
					caret.focusOffset === BIDI_RTL_LATIN_MID - 1
					? "passed"
					: "failed",
				`caret=${JSON.stringify(caret)}`,
			),
		).toMatchObject({
			blockId: BIDI_RTL_EMBED_ID,
			isCollapsed: false,
			anchorOffset: BIDI_RTL_LATIN_MID,
			focusOffset: BIDI_RTL_LATIN_MID - 1,
		});
	},
);

scenario(
	"M2 M4: word-arrow bindings swap on RTL (logical word, remapped keys)",
	async (s, page) => {
		const loads = logLoad("M2-word");
		await s.load("bidi-mixed");
		await clickOffset(page, BIDI_RTL_EMBED_ID, BIDI_RTL_LATIN_MID);
		await page.keyboard.press(WORD_LEFT);
		const left = await readCaret(page);
		const leftS2 = await readS2(page);

		await clickOffset(page, BIDI_RTL_EMBED_ID, BIDI_RTL_LATIN_MID);
		await page.keyboard.press(WORD_RIGHT);
		const right = await readCaret(page);
		const rightS2 = await readS2(page);
		await attachJson("m2-word", { loads, left, leftS2, right, rightS2 });

		expectS2Matched(leftS2, "M2: S2 after word-left");
		expectS2Matched(rightS2, "M2: S2 after word-right");
		expect(
			left?.offset,
			formatCheckReport(
				"M2 M4: word-left on rtl dispatches pen.caretWordRight",
				left?.offset === BIDI_RTL_EMBED_TEXT.length ? "passed" : "failed",
				`offset ${left?.offset ?? "null"} expected ${BIDI_RTL_EMBED_TEXT.length} key=${WORD_LEFT}`,
			),
		).toBe(BIDI_RTL_EMBED_TEXT.length);
		expect(
			right?.offset,
			formatCheckReport(
				"M2 M4: word-right on rtl dispatches pen.caretWordLeft",
				right?.offset === BIDI_RTL_LATIN_START ? "passed" : "failed",
				`offset ${right?.offset ?? "null"} expected ${BIDI_RTL_LATIN_START} key=${WORD_RIGHT}`,
			),
		).toBe(BIDI_RTL_LATIN_START);
	},
);
