import { expect } from "@playwright/test";
import {
	BIDI_LTR_EMBED_ID,
	BIDI_RTL_EMBED_ID,
	BIDI_RTL_LATIN_MID,
} from "../../fixtures/bidi";
import { formatCheckReport } from "../../src/checkReport";
import { scenario } from "../../src/scenario";
import {
	attachJson,
	clickOffset,
	expectS2Matched,
	isIsolate,
	logLoad,
	readBlockText,
	readDir,
	readS2,
	replayImeCommit,
} from "./helpers";

const DIR3_QUOTE_ID = "dir3-quote-ltr";
const DIR3_INNER_ID = "dir3-inner-rtl";
const RI3_BLOCK_ID = "ri3-paste-mixed";

scenario(
	"RI1: block content hosts use unicode-bidi isolate and never bidi-override",
	async (s, page) => {
		const loads = logLoad("RI1");
		await s.load("bidi-mixed");
		const rtl = await readDir(page, BIDI_RTL_EMBED_ID);
		const ltr = await readDir(page, BIDI_LTR_EMBED_ID);
		await attachJson("ri1", { loads, rtl, ltr });

		expect(
			rtl && ltr,
			formatCheckReport(
				"RI1: mixed hosts readable",
				rtl && ltr ? "passed" : "skipped",
				`rtl=${rtl?.unicodeBidi ?? "missing"} ltr=${ltr?.unicodeBidi ?? "missing"}`,
			),
		).toBeTruthy();
		expect(
			isIsolate(rtl!.unicodeBidi),
			formatCheckReport(
				"RI1: rtl host is unicode-bidi isolate",
				isIsolate(rtl!.unicodeBidi) ? "passed" : "failed",
				`unicodeBidi=${rtl!.unicodeBidi}`,
			),
		).toBe(true);
		expect(
			isIsolate(ltr!.unicodeBidi),
			formatCheckReport(
				"RI1: ltr host is unicode-bidi isolate",
				isIsolate(ltr!.unicodeBidi) ? "passed" : "failed",
				`unicodeBidi=${ltr!.unicodeBidi}`,
			),
		).toBe(true);
		expect(
			/override/i.test(rtl!.unicodeBidi) || /override/i.test(ltr!.unicodeBidi),
			formatCheckReport(
				"RI1: never bidi-override",
				"passed",
				`rtl=${rtl!.unicodeBidi} ltr=${ltr!.unicodeBidi}`,
			),
		).toBe(false);
	},
);

scenario(
	"RI2: IME composition in an RTL run commits without a special-case path",
	async (s, page) => {
		const loads = logLoad("RI2");
		await s.load("bidi-mixed");
		await clickOffset(page, BIDI_RTL_EMBED_ID, BIDI_RTL_LATIN_MID);
		const after = await replayImeCommit(page, BIDI_RTL_EMBED_ID, "x");
		const text = await readBlockText(page, BIDI_RTL_EMBED_ID);
		const s2 = await readS2(page);
		await attachJson("ri2", { loads, after, text, s2 });

		expectS2Matched(s2, "RI2: S2 after IME commit in RTL");
		expect(
			text.includes("x") || after.includes("x"),
			formatCheckReport(
				"RI2: composition in RTL reaches authority or surface",
				text.includes("x") || after.includes("x") ? "passed" : "failed",
				`text=${JSON.stringify(text)} after=${JSON.stringify(after)}`,
			),
		).toBe(true);
	},
	{
		initScript: () => {
			delete (globalThis as { EditContext?: unknown }).EditContext;
			delete (window as { EditContext?: unknown }).EditContext;
		},
	},
);

scenario(
	"RI3: paste of mixed-direction text is plain content and DIR1 re-resolves dir",
	async (s, page) => {
		const loads = logLoad("RI3");
		await s.load("hello-world");
		await s.apply([
			{
				type: "insert-block",
				blockId: RI3_BLOCK_ID,
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: RI3_BLOCK_ID,
				from: 0,
				to: 0,
				insert: "Hello",
			},
		]);
		await expect(page.locator(`[data-block-id="${RI3_BLOCK_ID}"]`)).toBeVisible();
		const before = await readDir(page, RI3_BLOCK_ID);
		await s.pasteHtml("<p>مرحبا Hello</p>");
		const after = await page.evaluate(() => {
			const blocks = Array.from(
				document.querySelectorAll("[data-pen-editor-block]"),
			);
			return blocks.map((block) => {
				if (!(block instanceof HTMLElement)) {
					return null;
				}
				const inline = block.querySelector("[data-pen-inline-content]");
				const host = inline instanceof HTMLElement ? inline : block;
				return {
					blockId: block.getAttribute("data-block-id"),
					dir: block.getAttribute("dir"),
					text: inline?.textContent ?? "",
					unicodeBidi: getComputedStyle(host).unicodeBidi,
				};
			});
		});
		const s2 = await readS2(page);
		await attachJson("ri3", { loads, before, after, s2 });

		expectS2Matched(s2, "RI3: S2 after mixed-direction paste");
		const pasted = after.find(
			(snap) => snap && /مرحبا/.test(snap.text) && /Hello/.test(snap.text),
		);
		expect(
			pasted,
			formatCheckReport(
				"RI3: mixed-direction paste is plain content",
				pasted ? "passed" : "failed",
				`hosts=${JSON.stringify(after)}`,
			),
		).toBeTruthy();
		expect(
			pasted!.dir,
			formatCheckReport(
				"RI3 DIR1: first-strong Arabic re-resolves pasted host to rtl",
				pasted!.dir === "rtl" ? "passed" : "failed",
				`dir=${pasted!.dir} text=${JSON.stringify(pasted!.text)}`,
			),
		).toBe("rtl");
		expect(
			pasted!.dir === "auto",
			formatCheckReport(
				"RI3 DIR2: paste never writes dir=auto",
				pasted!.dir === "auto" ? "failed" : "passed",
				`dir=${pasted!.dir}`,
			),
		).toBe(false);
	},
);

scenario(
	"RI4: caretRect on an RTL mixed block is readable after a click (overlay inherits G3)",
	async (s, page) => {
		const loads = logLoad("RI4");
		await s.load("bidi-mixed");
		await clickOffset(page, BIDI_RTL_EMBED_ID, BIDI_RTL_LATIN_MID);
		const lines = await s.geometry.lineBoxes(BIDI_RTL_EMBED_ID);
		const compare = await s.geometry.compare([
			{ blockId: BIDI_RTL_EMBED_ID, offset: BIDI_RTL_LATIN_MID },
		]);
		const s2 = await readS2(page);
		await attachJson("ri4", { loads, lines, compare, s2 });

		expectS2Matched(s2, "RI4: S2 after RTL caret click");
		expect(
			lines.length,
			formatCheckReport(
				"RI4: RTL mixed block produced line boxes",
				lines.length > 0 ? "passed" : "failed",
				`lines=${JSON.stringify(lines)}`,
			),
		).toBeGreaterThan(0);
		expect(
			compare.missingCount,
			formatCheckReport(
				"RI4: caretRect is present for the RTL caret",
				compare.missingCount === 0 ? "passed" : "failed",
				`missing=${compare.missingCount} stale=${compare.staleCount} compares=${compare.compares.length}`,
			),
		).toBe(0);
	},
);

scenario(
	"DIR3: nested blocks resolve dir independently (rtl child inside ltr quote)",
	async (s, page) => {
		const loads = logLoad("DIR3");
		await s.load("hello-world");
		await s.apply([
			{
				type: "insert-block",
				blockId: DIR3_QUOTE_ID,
				blockType: "blockquote",
				props: { direction: "ltr" },
				position: "last",
			},
			{
				type: "insert-block",
				blockId: DIR3_INNER_ID,
				blockType: "paragraph",
				props: { direction: "rtl", parentId: DIR3_QUOTE_ID },
				position: "last",
			},
			{
				type: "splice-text",
				blockId: DIR3_QUOTE_ID,
				from: 0,
				to: 0,
				insert: "Outer quote",
			},
			{
				type: "splice-text",
				blockId: DIR3_INNER_ID,
				from: 0,
				to: 0,
				insert: "مرحبا",
			},
		]);
		await expect(page.locator(`[data-block-id="${DIR3_QUOTE_ID}"]`)).toBeVisible();
		await expect(page.locator(`[data-block-id="${DIR3_INNER_ID}"]`)).toBeVisible();
		const quote = await readDir(page, DIR3_QUOTE_ID);
		const inner = await readDir(page, DIR3_INNER_ID);
		await attachJson("dir3", { loads, quote, inner });

		expect(
			quote?.dir,
			formatCheckReport(
				"DIR3: ltr quote keeps dir=ltr",
				quote?.dir === "ltr" ? "passed" : "failed",
				`dir=${quote?.dir} text=${JSON.stringify(quote?.text)}`,
			),
		).toBe("ltr");
		expect(
			inner?.dir,
			formatCheckReport(
				"DIR3: nested rtl paragraph resolves independently",
				inner?.dir === "rtl" ? "passed" : "failed",
				`dir=${inner?.dir} text=${JSON.stringify(inner?.text)}`,
			),
		).toBe("rtl");
	},
);
