import { expect, type Page } from "@playwright/test";
import {
	BIDI_LTR_EMBED_ID,
	BIDI_LTR_EMBED_TEXT,
	BIDI_RTL_EMBED_ID,
	BIDI_RTL_EMBED_TEXT,
	BIDI_RTL_LATIN_MID,
	BIDI_RTL_LATIN_START,
} from "../fixtures/bidi";
import { getInlineOffsetPoint } from "../src/domGeometry";
import { scenario } from "../src/scenario";
import { assertDomAuthorityResult } from "../src/standingAssertions";
import type { DomAuthorityCheck } from "../src/types";

const WORD_LEFT = process.platform === "darwin" ? "Alt+ArrowLeft" : "Control+ArrowLeft";
const WORD_RIGHT = process.platform === "darwin" ? "Alt+ArrowRight" : "Control+ArrowRight";

type TextCaret = {
	blockId: string;
	offset: number;
	isCollapsed: boolean;
	anchorOffset: number;
	focusOffset: number;
};

async function readCaret(page: Page): Promise<TextCaret | null> {
	return page.evaluate(() => {
		const selection = window.__penConformance.selection;
		if (selection?.type !== "text") {
			return null;
		}
		return {
			blockId: selection.focus.blockId,
			offset: selection.focus.offset,
			isCollapsed: window.__penConformance.isCollapsed(),
			anchorOffset: selection.anchor.offset,
			focusOffset: selection.focus.offset,
		};
	});
}

async function assertMixedBlock(
	page: Page,
	blockId: string,
	expected: { dir: "ltr" | "rtl"; text: string },
): Promise<void> {
	await expect
		.poll(async () => {
			return page.evaluate(
				({ id, text, dir }) => {
					const block = document.querySelector(`[data-block-id="${id}"]`);
					if (!(block instanceof HTMLElement)) {
						return "missing-block";
					}
					const inline = block.querySelector("[data-pen-inline-content]");
					const content = inline?.textContent ?? "";
					if (!content.includes(text)) {
						return `text:${content}`;
					}
					if (!/[\u0590-\u08FF]/.test(content) || !/[A-Za-z]/.test(content)) {
						return `not-mixed:${content}`;
					}
					if (block.getAttribute("dir") !== dir) {
						return `dir:${block.getAttribute("dir")}`;
					}
					return "ok";
				},
				{ id: blockId, text: expected.text, dir: expected.dir },
			);
		})
		.toBe("ok");
}

async function clickOffset(
	page: Page,
	blockId: string,
	offset: number,
): Promise<void> {
	const point = await getInlineOffsetPoint(page, { blockId, offset });
	await page.mouse.click(point.x, point.y);
	await expect
		.poll(async () => {
			const caret = await readCaret(page);
			if (!caret) {
				return "not-text";
			}
			return `${caret.blockId}:${caret.offset}:${caret.isCollapsed}`;
		})
		.toBe(`${blockId}:${offset}:true`);
}

async function pressAndRead(
	page: Page,
	key: string,
): Promise<{ caret: TextCaret | null; s2: DomAuthorityCheck }> {
	await page.keyboard.press(key);
	const caret = await readCaret(page);
	const s2 = await page.evaluate(() =>
		window.__penConformance.domMatchesAuthority(),
	);
	return { caret, s2 };
}

function report(key: string, caret: TextCaret | null, s2: DomAuthorityCheck): string {
	return `${key} caret=${JSON.stringify(caret)} s2=${JSON.stringify(s2)}`;
}

scenario(
	"M2: ArrowLeft in an RTL mixed-direction block advances logical offset (keymap swap)",
	async (s, page) => {
		await s.load("bidi-mixed");
		await assertMixedBlock(page, BIDI_RTL_EMBED_ID, {
			dir: "rtl",
			text: BIDI_RTL_EMBED_TEXT,
		});
		await clickOffset(page, BIDI_RTL_EMBED_ID, BIDI_RTL_LATIN_MID);
		const { caret, s2 } = await pressAndRead(page, "ArrowLeft");
		assertDomAuthorityResult(s2);
		expect(
			caret?.offset,
			`M2: ArrowLeft on rtl should dispatch pen.caretRight (logical +1). ${report("ArrowLeft", caret, s2)}`,
		).toBe(BIDI_RTL_LATIN_MID + 1);
	},
);

scenario(
	"M2: ArrowRight in an RTL mixed-direction block retreats logical offset (keymap swap)",
	async (s, page) => {
		await s.load("bidi-mixed");
		await assertMixedBlock(page, BIDI_RTL_EMBED_ID, {
			dir: "rtl",
			text: BIDI_RTL_EMBED_TEXT,
		});
		await clickOffset(page, BIDI_RTL_EMBED_ID, BIDI_RTL_LATIN_MID);
		const { caret, s2 } = await pressAndRead(page, "ArrowRight");
		assertDomAuthorityResult(s2);
		expect(
			caret?.offset,
			`M2: ArrowRight on rtl should dispatch pen.caretLeft (logical -1). ${report("ArrowRight", caret, s2)}`,
		).toBe(BIDI_RTL_LATIN_MID - 1);
	},
);

scenario(
	"M2: Shift-ArrowLeft on RTL extends logical forward (extend variant swap)",
	async (s, page) => {
		await s.load("bidi-mixed");
		await clickOffset(page, BIDI_RTL_EMBED_ID, BIDI_RTL_LATIN_MID);
		const left = await pressAndRead(page, "Shift+ArrowLeft");
		assertDomAuthorityResult(left.s2);
		expect(
			left.caret,
			`M2: Shift-ArrowLeft on rtl should extend logical forward. ${report("Shift+ArrowLeft", left.caret, left.s2)}`,
		).toMatchObject({
			blockId: BIDI_RTL_EMBED_ID,
			isCollapsed: false,
			anchorOffset: BIDI_RTL_LATIN_MID,
			focusOffset: BIDI_RTL_LATIN_MID + 1,
		});
	},
);

scenario(
	"M2: word-arrow bindings swap on RTL (logical word, remapped keys)",
	async (s, page) => {
		await s.load("bidi-mixed");
		await clickOffset(page, BIDI_RTL_EMBED_ID, BIDI_RTL_LATIN_MID);
		const left = await pressAndRead(page, WORD_LEFT);
		assertDomAuthorityResult(left.s2);
		expect(
			left.caret?.offset,
			`M2: ${WORD_LEFT} on rtl should dispatch pen.caretWordRight. ${report(WORD_LEFT, left.caret, left.s2)}`,
		).toBe(BIDI_RTL_EMBED_TEXT.length);

		await clickOffset(page, BIDI_RTL_EMBED_ID, BIDI_RTL_LATIN_MID);
		const right = await pressAndRead(page, WORD_RIGHT);
		assertDomAuthorityResult(right.s2);
		expect(
			right.caret?.offset,
			`M2: ${WORD_RIGHT} on rtl should dispatch pen.caretWordLeft. ${report(WORD_RIGHT, right.caret, right.s2)}`,
		).toBe(BIDI_RTL_LATIN_START);
	},
);

scenario(
	"M2: LTR mixed-direction control does not swap ArrowLeft/Right",
	async (s, page) => {
		await s.load("bidi-mixed");
		await assertMixedBlock(page, BIDI_LTR_EMBED_ID, {
			dir: "ltr",
			text: BIDI_LTR_EMBED_TEXT,
		});
		const mid = 3;
		await clickOffset(page, BIDI_LTR_EMBED_ID, mid);
		const afterLeft = await pressAndRead(page, "ArrowLeft");
		assertDomAuthorityResult(afterLeft.s2);
		expect(
			afterLeft.caret?.offset,
			`M2 ltr control: ArrowLeft stays pen.caretLeft. ${report("ArrowLeft", afterLeft.caret, afterLeft.s2)}`,
		).toBe(mid - 1);
		const afterRight = await pressAndRead(page, "ArrowRight");
		assertDomAuthorityResult(afterRight.s2);
		expect(
			afterRight.caret?.offset,
			`M2 ltr control: ArrowRight stays pen.caretRight. ${report("ArrowRight", afterRight.caret, afterRight.s2)}`,
		).toBe(mid);
	},
);
