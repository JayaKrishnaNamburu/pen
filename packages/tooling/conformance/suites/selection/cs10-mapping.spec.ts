import { expect, type Page } from "@playwright/test";
import { formatCheckReport } from "../../src/checkReport";
import { scenario } from "../../src/scenario";
import type { LogicalPoint } from "../../src/types";

type MappedSelection = {
	anchor: LogicalPoint;
	focus: LogicalPoint;
} | null;

type NativeSnapshot = {
	isCollapsed: boolean;
	text: string;
	rangeCount: number;
};

scenario("CS10: maps empty getSelection to null", async (s, page) => {
	await s.load("hello-world");
	const mapped = await page.evaluate(() => {
		const root = window.__penConformance.mountSelectionProbe("Hello", "p1");
		try {
			window.getSelection()?.removeAllRanges();
			return window.__penConformance.mapDomSelection(root);
		} finally {
			root.remove();
		}
	});
	expect(
		mapped,
		formatCheckReport(
			"CS10: empty getSelection maps to null",
			mapped === null ? "passed" : "failed",
			mapped === null
				? undefined
				: `mapped ${mapped.anchor.blockId}:${mapped.anchor.offset}`,
		),
	).toBeNull();
	await s.selectText(0, 0);
});

scenario(
	"CS10: maps a collapsed native caret to editor offsets",
	async (s, page) => {
		await s.load("hello-world");
		const mapped = await page.evaluate(() => {
			const root = window.__penConformance.mountSelectionProbe("Hello", "p1");
			try {
				const inline = root.querySelector("[data-pen-inline-content]");
				const text = inline?.firstChild as Text;
				const range = document.createRange();
				range.setStart(text, 2);
				range.collapse(true);
				const selection = window.getSelection();
				selection?.removeAllRanges();
				selection?.addRange(range);
				return window.__penConformance.mapDomSelection(root);
			} finally {
				root.remove();
			}
		});
		expect(
			mapped,
			formatCheckReport(
				"CS10: collapsed caret mapped",
				mapped ? "passed" : "failed",
				mapped ? undefined : "mapDomSelection returned null",
			),
		).toEqual({
			anchor: { blockId: "p1", offset: 2 },
			focus: { blockId: "p1", offset: 2 },
		} satisfies MappedSelection);
		await s.selectText(0, 0);
	},
);

scenario(
	"CS10: maps a same-block native range to editor offsets",
	async (s, page) => {
		await s.load("hello-world");
		const mapped = await page.evaluate(() => {
			const root = window.__penConformance.mountSelectionProbe("Hello", "p1");
			try {
				const inline = root.querySelector("[data-pen-inline-content]");
				const text = inline?.firstChild as Text;
				const range = document.createRange();
				range.setStart(text, 1);
				range.setEnd(text, 4);
				const selection = window.getSelection();
				selection?.removeAllRanges();
				selection?.addRange(range);
				return window.__penConformance.mapDomSelection(root);
			} finally {
				root.remove();
			}
		});
		expect(
			mapped,
			formatCheckReport(
				"CS10: same-block range mapped",
				mapped ? "passed" : "failed",
				mapped ? undefined : "mapDomSelection returned null",
			),
		).toEqual({
			anchor: { blockId: "p1", offset: 1 },
			focus: { blockId: "p1", offset: 4 },
		} satisfies MappedSelection);
		await s.selectText(0, 0);
	},
);

scenario(
	"CS10: maps a selection outside the editor root to null",
	async (s, page) => {
		await s.load("hello-world");
		const mapped = await page.evaluate(() => {
			const root = window.__penConformance.mountSelectionProbe("Hello", "p1");
			const outsider = document.createElement("p");
			outsider.textContent = "other";
			document.body.append(outsider);
			try {
				const range = document.createRange();
				range.selectNodeContents(outsider);
				const selection = window.getSelection();
				selection?.removeAllRanges();
				selection?.addRange(range);
				return window.__penConformance.mapDomSelection(root);
			} finally {
				outsider.remove();
				root.remove();
			}
		});
		expect(
			mapped,
			formatCheckReport(
				"CS10: outside-root selection maps to null",
				mapped === null ? "passed" : "failed",
				mapped === null
					? undefined
					: `mapped ${mapped.anchor.blockId}:${mapped.anchor.offset}`,
			),
		).toBeNull();
		await s.selectText(0, 0);
	},
);

scenario(
	"CS10: projects a same-block authority range into window.getSelection",
	async (s, page) => {
		await s.load("hello-world");
		const paragraph = "Alpha bravo charlie delta echo";
		const native = await page.evaluate((text) => {
			const root = window.__penConformance.mountSelectionProbe(
				text,
				"block-1",
			);
			try {
				window.__penConformance.projectSelectionToDom(
					root,
					{ blockId: "block-1", offset: 0 },
					{ blockId: "block-1", offset: text.length },
				);
				const selection = window.getSelection();
				return {
					isCollapsed: selection?.isCollapsed ?? true,
					text: selection?.toString() ?? "",
					rangeCount: selection?.rangeCount ?? 0,
				} satisfies NativeSnapshot;
			} finally {
				root.remove();
			}
		}, paragraph);
		expect(
			native.isCollapsed,
			formatCheckReport(
				"CS10: projected range is not collapsed",
				native.isCollapsed ? "failed" : "passed",
				`rangeCount=${native.rangeCount} text=${JSON.stringify(native.text)}`,
			),
		).toBe(false);
		expect(
			native.text,
			formatCheckReport(
				"CS10: projected getSelection.toString matches the paragraph",
				native.text === paragraph ? "passed" : "failed",
				native.text === paragraph
					? undefined
					: `got ${JSON.stringify(native.text)}`,
			),
		).toBe(paragraph);
		await s.selectText(0, 0);
	},
);
