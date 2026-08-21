import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { loadavg } from "node:os";
import { clickInlineOffset, openPlayground } from "./helpers";
import {
	dragAcrossBlocks,
	installKeyDefaultPreventedProbe,
	quietPlaygroundAssist,
	recordLiveTrace,
	typeParagraphs,
	type LiveTrace,
} from "./liveTrace";

test("T1 keystroke diverges: first Mod-a is document text, second stays text, Backspace deletes a range", async ({
	page,
	browserName,
}, testInfo) => {
	await openQuietPlayground(page);
	await typeParagraphs(page, ["Alpha", "Bravo", "Charlie"]);
	await page.locator("[data-pen-inline-content]").first().click();
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("ArrowRight");

	await page.keyboard.press("ControlOrMeta+A");
	const afterFirst = await recordStep(
		page,
		testInfo,
		browserName,
		"t1-first-mod-a",
	);

	await page.keyboard.press("ControlOrMeta+A");
	const afterSecond = await recordStep(
		page,
		testInfo,
		browserName,
		"t1-second-mod-a",
	);

	await page.keyboard.press("Backspace");
	const afterBackspace = await recordStep(
		page,
		testInfo,
		browserName,
		"t1-backspace-after-mod-a",
	);

	expect(afterFirst.selection?.type).toBe("text");
	expect(afterFirst.selection?.isMultiBlock).toBe(true);
	expect(afterFirst.selectedText.replaceAll(/\s+/g, "")).toBe(
		"AlphaBravoCharlie",
	);
	expect(afterSecond.selection?.type).toBe("text");
	expect(afterSecond.selection?.isMultiBlock).toBe(true);
	expect(afterBackspace.selection?.type).not.toBe("block");
	expect(afterBackspace.blocks.some((block) => block.text === "Alpha")).toBe(
		false,
	);
});

test("T1 keystroke diverges: block-first second Mod-a is still document text", async ({
	page,
	browserName,
}, testInfo) => {
	await openQuietPlayground(page);
	await typeParagraphs(page, ["Alpha", "Bravo", "Charlie"]);
	await page
		.getByRole("button", { name: /Toggle selection model/ })
		.click();
	await expect(
		page.getByRole("button", { name: /Current mode: Block-first/ }),
	).toBeVisible();

	await page.locator("[data-pen-inline-content]").nth(1).click();

	await page.keyboard.press("ControlOrMeta+A");
	const afterFirst = await recordStep(
		page,
		testInfo,
		browserName,
		"t1-block-first-first-mod-a",
	);

	await page.keyboard.press("ControlOrMeta+A");
	const afterSecond = await recordStep(
		page,
		testInfo,
		browserName,
		"t1-block-first-second-mod-a",
	);

	expect(afterFirst.selection?.type).toBe("text");
	expect(afterSecond.selection?.type).toBe("text");
	expect(afterSecond.selection?.isMultiBlock).toBe(true);
	expect(afterSecond.selectedText.replaceAll(/\s+/g, "")).toBe(
		"AlphaBravoCharlie",
	);
});

test("inline-atom Backspace diverges from select-then-delete; ArrowLeft selects", async ({
	page,
	browserName,
}, testInfo) => {
	test.skip(
		browserName === "webkit",
		"WebKit hangs after ArrowLeft next to a mention (page.evaluate never returns).",
	);
	await openPlayground(page, mentionTracePath());
	await quietPlaygroundAssist(page);
	const atom = page.locator("[data-pen-inline-atom]");
	await expect(atom).toHaveCount(1);
	const box = await atom.boundingBox();
	if (!box) {
		const missing = await recordStep(
			page,
			testInfo,
			browserName,
			"atom-missing-box",
		);
		expect(missing.inlineAtomCount).toBe(1);
		return;
	}

	await page.mouse.click(box.x + box.width + 3, box.y + box.height / 2);
	await page.keyboard.press("ArrowLeft");
	const afterArrow = await recordStep(
		page,
		testInfo,
		browserName,
		"atom-arrow-left",
	);

	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("Backspace");
	const afterBackspace = await recordStep(
		page,
		testInfo,
		browserName,
		"atom-backspace",
	);

	expect(afterArrow.inlineAtomCount).toBe(1);
	expect(afterArrow.selection?.type).toBe("text");
	expect(afterArrow.selection?.isCollapsed).toBe(false);
	expect(afterArrow.selection?.anchor?.offset).toBe(2);
	expect(afterArrow.selection?.focus?.offset).toBe(3);
	expect(afterBackspace.inlineAtomCount).toBe(0);
	expect(afterBackspace.blocks[0]?.text.replaceAll("\u200B", "")).toBe("hiz");
});

test("T3 live: a 51-block pointer drag stays multi-block text", async ({
	page,
	browserName,
}, testInfo) => {
	test.setTimeout(90_000);
	await openQuietPlayground(page);
	const paragraphs = Array.from({ length: 51 }, (_, index) =>
		`P${String(index).padStart(2, "0")}`,
	);
	await typeParagraphs(page, paragraphs);
	await dragAcrossBlocks(page, 0, 50);
	const afterDrag = await recordStep(
		page,
		testInfo,
		browserName,
		"t3-51-block-drag",
	);

	const lastInline = page.locator("[data-pen-inline-content]").nth(50);
	await page.locator("[data-pen-inline-content]").first().click();
	await lastInline.click({ modifiers: ["Shift"] });
	const afterShiftClick = await recordStep(
		page,
		testInfo,
		browserName,
		"t3-51-block-shift-click",
	);

	await page.keyboard.press("ArrowDown");
	const afterArrow = await recordStep(
		page,
		testInfo,
		browserName,
		"t4-arrow-after-51-block-selection",
	);

	await page.keyboard.press("Shift+ArrowDown");
	const afterShiftArrow = await recordStep(
		page,
		testInfo,
		browserName,
		"t4-shift-arrow-after-51-block-selection",
	);

	expect(afterDrag.selection?.type).toBe("text");
	expect(afterDrag.selection?.isMultiBlock).toBe(true);
	expect(afterDrag.blockCount).toBe(51);
	if (browserName === "chromium") {
		expect(afterShiftClick.selection?.type).toBe("block");
		expect(afterShiftClick.selection?.blockIds?.length).toBe(51);
		expect(afterArrow.selection?.type).toBe("block");
		expect(afterArrow.selection?.blockIds?.length).toBe(51);
		expect(afterShiftArrow.selection?.type).toBe("block");
		expect(afterShiftArrow.selection?.blockIds?.length).toBe(51);
	} else {
		expect(afterShiftClick.selection?.type).toBe("text");
		expect(afterArrow.selection?.type).toBe("text");
	}
});

test("O1 keystroke diverges: overlay caret is shown for ordinary collapsed typing", async ({
	page,
	browserName,
}, testInfo) => {
	await openQuietPlayground(page);
	await typeParagraphs(page, ["Hello"]);
	await page.locator("[data-pen-inline-content]").first().click();
	const firstBlockId = await page
		.locator("[data-pen-editor-block]")
		.first()
		.getAttribute("data-block-id");
	expect(firstBlockId).toBeTruthy();
	await clickInlineOffset(page, firstBlockId!, 3);
	const afterClick = await recordStep(
		page,
		testInfo,
		browserName,
		"o1-ordinary-caret",
	);

	expect(afterClick.selection?.type).toBe("text");
	expect(afterClick.selection?.isCollapsed).toBe(true);
	expect(afterClick.overlayCaretCount).toBeGreaterThan(0);
});

test("K1 live: PageDown on an unbound nav key", async ({
	page,
	browserName,
}, testInfo) => {
	await openQuietPlayground(page);
	await typeParagraphs(page, ["Alpha", "Bravo"]);
	await page.locator("[data-pen-inline-content]").first().click();
	await installKeyDefaultPreventedProbe(page);
	await recordStep(page, testInfo, browserName, "k1-before-page-down");
	await page.keyboard.press("PageDown");
	const after = await recordStep(page, testInfo, browserName, "k1-page-down");

	expect(after.keyProbe?.key).toBe("PageDown");
	expect(after.keyProbe?.defaultPrevented).toBe(false);
	expect(after.selection?.type).toBe("text");
	expect(after.selection?.isCollapsed).toBe(true);
});

test("T6 live: table cell Shift+Arrow and grid-edge Arrow", async ({
	page,
	browserName,
}, testInfo) => {
	await openQuietPlayground(page);
	await page.locator("[data-pen-inline-content]").first().click();
	await page.keyboard.type("/table");
	const slashMenu = page.locator("[data-pen-slash-menu]");
	await expect(slashMenu).toHaveAttribute("data-open", "");
	await page.keyboard.press("Enter");
	const cells = page.locator("[data-pen-table-cell]");
	await expect(cells.first()).toBeVisible();

	await cells
		.filter({ has: page.locator("[data-cell-row='0'][data-cell-col='0']") })
		.or(page.locator("[data-pen-table-cell][data-cell-row='0'][data-cell-col='0']"))
		.first()
		.click();
	await page.keyboard.press("Shift+ArrowRight");
	const afterShift = await recordStep(
		page,
		testInfo,
		browserName,
		"t6-shift-arrow-cell",
	);

	await page.keyboard.press("ArrowUp");
	await page.keyboard.press("ArrowLeft");
	const afterEdge = await recordStep(
		page,
		testInfo,
		browserName,
		"t6-arrow-at-grid-edge",
	);

	expect(afterShift.selection?.type).toBe("cell");
	expect(afterShift.selection?.cellAnchor).toEqual({ row: 0, col: 0 });
	expect(afterShift.selection?.cellHead).toEqual({ row: 0, col: 1 });
	expect(afterEdge.selection?.type).toBe("text");
});

test("B1 live: rewriting a text node without beforeinput", async ({
	page,
	browserName,
}, testInfo) => {
	await openQuietPlayground(page);
	await typeParagraphs(page, ["Hello"]);
	const before = await recordStep(page, testInfo, browserName, "b1-before-dom-rewrite");
	await page.evaluate(() => {
		const inline = document.querySelector("[data-pen-inline-content]");
		if (!(inline instanceof HTMLElement)) {
			throw new Error("Missing inline surface.");
		}
		const walker = document.createTreeWalker(inline, NodeFilter.SHOW_TEXT);
		const textNode = walker.nextNode();
		if (!(textNode instanceof Text)) {
			throw new Error("Missing text node.");
		}
		textNode.data = `${textNode.data}X`;
	});
	await page.waitForTimeout(250);
	const after = await recordStep(page, testInfo, browserName, "b1-after-dom-rewrite");

	expect(before.blocks[0]?.text.replaceAll("\u200B", "")).toBe("Hello");
	if (browserName === "webkit") {
		expect(after.blocks[0]?.text.replaceAll("\u200B", "")).toBe("HelloX");
	} else {
		expect(after.blocks[0]?.text.replaceAll("\u200B", "")).toBe("Hello");
	}
});

async function openQuietPlayground(page: Page): Promise<void> {
	await openPlayground(page);
	await quietPlaygroundAssist(page);
}

function mentionTracePath(): string {
	return `/?room=pen-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}&trace=mention`;
}

async function recordStep(
	page: Page,
	testInfo: TestInfo,
	browserName: string,
	step: string,
): Promise<LiveTrace> {
	const settled = await recordLiveTrace(
		page,
		`${browserName}-${step}`,
		{
			browserName,
			step,
			loadavg: loadavg(),
		},
	);
	await testInfo.attach(step, {
		body: JSON.stringify(settled, null, 2),
		contentType: "application/json",
	});
	return settled;
}
