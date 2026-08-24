import { expect, test, type Page } from "@playwright/test";
import { loadavg } from "node:os";
import { formatCheckReport } from "../../src/checkReport";
import { scenario } from "../../src/scenario";
import type { SerializedSelection } from "../../src/types";

const AX6 = "/?ax6=1";
const DIVIDER_ID = "o3-d1";
const AFTER_ID = "two-p1";

type OverlaySnapshot = {
	kind: "present" | "absent" | "unchecked";
	reason: string;
	nativeCollapsed: boolean | null;
};

function logLoad(label: string): number[] {
	const loads = loadavg();
	console.log(`${label} loadavg ${loads.join(" ")}`);
	return loads;
}

async function readSelection(page: Page): Promise<SerializedSelection> {
	return page.evaluate(() => window.__penConformance.selection);
}

async function readOverlay(page: Page): Promise<OverlaySnapshot> {
	return page.evaluate(() => {
		const overlay = document.querySelector(
			"[data-pen-editor-caret-overlay]",
		);
		const native = window.getSelection();
		const nativeCollapsed = native ? native.isCollapsed : null;
		if (!(overlay instanceof HTMLElement)) {
			return {
				kind: "unchecked" as const,
				reason: "CaretOverlay is not mounted (need ?ax6=1)",
				nativeCollapsed,
			};
		}
		const caret = document.querySelector("[data-pen-editor-caret]");
		const visible = overlay.hasAttribute("data-caret-visible");
		if (!(caret instanceof HTMLElement) || !visible) {
			return {
				kind: "absent" as const,
				reason: "overlay caret is not drawn",
				nativeCollapsed,
			};
		}
		return {
			kind: "present" as const,
			reason: "overlay caret is still drawn during block selection",
			nativeCollapsed,
		};
	});
}

scenario(
	"O3: clicking a divider becomes BlockSelection with no overlay caret",
	async (s, page) => {
		const loads = logLoad("O3");
		await s.load("two-paragraph");
		await s.apply([
			{
				type: "insert-block",
				blockId: DIVIDER_ID,
				blockType: "divider",
				props: {},
				position: { after: AFTER_ID },
			},
		]);
		const divider = page.locator(`[data-block-id="${DIVIDER_ID}"]`);
		await expect(divider).toBeVisible();
		await divider.click();

		const selection = await readSelection(page);
		const overlay = await readOverlay(page);
		const selected = await page.evaluate((id) => {
			const block = document.querySelector(`[data-block-id="${id}"]`);
			return block instanceof HTMLElement
				? block.hasAttribute("data-selected")
				: false;
		}, DIVIDER_ID);
		const outline = await page.evaluate(() => {
			return document.querySelector("[data-pen-selection-rect]") != null;
		});
		await test.info().attach("o3-block", {
			body: JSON.stringify(
				{ loadavg: loads, selection, overlay, selected, outline },
				null,
				2,
			),
			contentType: "application/json",
		});

		expect(
			selection,
			formatCheckReport(
				"O3: divider click is BlockSelection",
				selection?.type === "block" &&
					selection.blockIds.includes(DIVIDER_ID)
					? "passed"
					: "failed",
				`selection=${JSON.stringify(selection)}`,
			),
		).toMatchObject({
			type: "block",
			blockIds: [DIVIDER_ID],
		});
		expect(
			overlay.kind === "unchecked" ? "unchecked" : "checked",
			formatCheckReport(
				"O3: overlay host was checkable",
				overlay.kind === "unchecked" ? "skipped" : "passed",
				overlay.reason,
			),
		).toBe("checked");
		expect(
			overlay.kind,
			formatCheckReport(
				"O3: no overlay caret during block selection",
				overlay.kind === "absent" ? "passed" : "failed",
				overlay.reason,
			),
		).toBe("absent");
		expect(
			selected,
			formatCheckReport(
				"O3: divider carries data-selected",
				selected ? "passed" : "failed",
			),
		).toBe(true);
	},
	{ url: AX6 },
);
