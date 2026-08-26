import { expect, test, type Page } from "@playwright/test";
import { loadavg } from "node:os";
import { formatCheckReport } from "../../src/checkReport";
import { scenario } from "../../src/scenario";
import type { SerializedSelection } from "../../src/types";

const AX6 = "/?ax6=1";

type NativeSnapshot = {
	collapsed: boolean | null;
	rangeCount: number;
};

type OverlaySnapshot = {
	kind: "present" | "absent" | "unchecked";
	reason: string;
};

function logLoad(label: string): number[] {
	const loads = loadavg();
	console.log(`${label} loadavg ${loads.join(" ")}`);
	return loads;
}

async function readSelection(page: Page): Promise<SerializedSelection> {
	return page.evaluate(() => window.__penConformance.selection);
}

async function readNative(page: Page): Promise<NativeSnapshot> {
	return page.evaluate(() => {
		const native = window.getSelection();
		if (!native) {
			return { collapsed: null, rangeCount: 0 };
		}
		return { collapsed: native.isCollapsed, rangeCount: native.rangeCount };
	});
}

async function readOverlay(page: Page): Promise<OverlaySnapshot> {
	return page.evaluate(() => {
		const overlay = document.querySelector(
			"[data-pen-editor-caret-overlay]",
		);
		if (!(overlay instanceof HTMLElement)) {
			return {
				kind: "unchecked" as const,
				reason: "CaretOverlay is not mounted (need ?ax6=1)",
			};
		}
		const caret = document.querySelector("[data-pen-editor-caret]");
		const visible = overlay.hasAttribute("data-caret-visible");
		if (!(caret instanceof HTMLElement) || !visible) {
			return {
				kind: "absent" as const,
				reason: "overlay caret is not drawn",
			};
		}
		return {
			kind: "present" as const,
			reason: "overlay caret is drawn over a multi-block text range",
		};
	});
}

scenario(
	"O4: a multi-block text drag keeps the native selection visible",
	async (s, page) => {
		const loads = logLoad("O4");
		await s.load("two-paragraph");
		await s.mouse.dragText({
			from: { blockId: "two-p1", offset: 2 },
			to: { blockId: "two-p2", offset: 5 },
		});

		const selection = await readSelection(page);
		const native = await readNative(page);
		const overlay = await readOverlay(page);
		const multiBlock =
			selection?.type === "text" &&
			selection.anchor.blockId !== selection.focus.blockId;
		await test.info().attach("o4-multiblock", {
			body: JSON.stringify(
				{ loadavg: loads, selection, native, overlay, multiBlock },
				null,
				2,
			),
			contentType: "application/json",
		});

		expect(
			multiBlock,
			formatCheckReport(
				"O4: drag stayed a multi-block text selection",
				multiBlock ? "passed" : "failed",
				`selection=${JSON.stringify(selection)}`,
			),
		).toBe(true);
		expect(
			native.collapsed === false && native.rangeCount > 0,
			formatCheckReport(
				"O4: native selection stays visible across blocks",
				native.collapsed === false && native.rangeCount > 0
					? "passed"
					: "failed",
				`native=${JSON.stringify(native)}`,
			),
		).toBe(true);
		expect(
			overlay.kind === "unchecked" ? "unchecked" : "checked",
			formatCheckReport(
				"O4: overlay host was checkable",
				overlay.kind === "unchecked" ? "skipped" : "passed",
				overlay.reason,
			),
		).toBe("checked");
		expect(
			overlay.kind,
			formatCheckReport(
				"O4: no overlay caret unless an endpoint is O1/O2",
				overlay.kind === "absent" ? "passed" : "failed",
				overlay.reason,
			),
		).toBe("absent");
	},
	{ url: AX6 },
);
