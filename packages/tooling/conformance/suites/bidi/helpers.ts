import { expect, test, type Page } from "@playwright/test";
import { loadavg } from "node:os";
import { formatCheckReport } from "../../src/checkReport";
import { getInlineOffsetPoint } from "../../src/domGeometry";
import { authorityCheckKind } from "../../src/standingAssertions";
import type { DomAuthorityCheck } from "../../src/types";

export type TextCaret = {
	blockId: string;
	offset: number;
	isCollapsed: boolean;
	anchorOffset: number;
	focusOffset: number;
};

export type DirSnapshot = {
	blockId: string;
	dir: string | null;
	text: string;
	unicodeBidi: string;
};

export function logLoad(label: string): number[] {
	const loads = loadavg();
	console.log(`${label} loadavg ${loads.join(" ")}`);
	return loads;
}

export async function attachJson(name: string, payload: unknown): Promise<void> {
	await test.info().attach(name, {
		body: JSON.stringify({ loadavg: loadavg(), payload }, null, 2),
		contentType: "application/json",
	});
}

export async function readCaret(page: Page): Promise<TextCaret | null> {
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

export async function readDir(page: Page, blockId: string): Promise<DirSnapshot | null> {
	return page.evaluate((id) => {
		const block = document.querySelector(`[data-block-id="${id}"]`);
		if (!(block instanceof HTMLElement)) {
			return null;
		}
		const inline = block.querySelector("[data-pen-inline-content]");
		const host = inline instanceof HTMLElement ? inline : block;
		return {
			blockId: id,
			dir: block.getAttribute("dir"),
			text: inline?.textContent ?? "",
			unicodeBidi: getComputedStyle(host).unicodeBidi,
		};
	}, blockId);
}

export async function readBlockText(page: Page, blockId: string): Promise<string> {
	return page.evaluate((id) => {
		const block = document.querySelector(`[data-block-id="${id}"]`);
		return (
			block?.querySelector("[data-pen-inline-content]")?.textContent ?? ""
		);
	}, blockId);
}

export async function clickOffset(
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

export async function readS2(page: Page): Promise<DomAuthorityCheck> {
	return page.evaluate(() => window.__penConformance.domMatchesAuthority());
}

export function expectS2Matched(
	s2: DomAuthorityCheck,
	label: string,
): void {
	const kind = authorityCheckKind(s2);
	expect(
		kind,
		formatCheckReport(
			label,
			kind === "matched" ? "passed" : kind === "unchecked" ? "skipped" : "failed",
			s2.reason,
		),
	).toBe("matched");
}

export function isIsolate(unicodeBidi: string): boolean {
	return /isolate/i.test(unicodeBidi) && !/override/i.test(unicodeBidi);
}
