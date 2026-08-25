import { expect, type Page } from "@playwright/test";
import { writeEvidence } from "./helpers";

export interface LiveTraceSelection {
	type: string;
	isCollapsed?: boolean;
	isMultiBlock?: boolean;
	anchor?: { blockId: string; offset: number };
	focus?: { blockId: string; offset: number };
	blockIds?: string[];
	head?: string | null;
	blockId?: string;
	cellAnchor?: { row: number; col: number };
	cellHead?: { row: number; col: number };
}

export interface LiveTrace {
	selection: LiveTraceSelection | null;
	selectedText: string;
	blockCount: number;
	blocks: Array<{
		id: string;
		type: string;
		text: string;
		length: number;
	}>;
	native: {
		isCollapsed: boolean | null;
		text: string;
		rangeCount: number;
	};
	overlayCaretCount: number;
	selectionRectCount: number;
	inlineAtomCount: number;
	inlineAtomTypes: string[];
	activeCaretColor: string | null;
	keyProbe: { key: string; defaultPrevented: boolean } | null;
}

export async function quietPlaygroundAssist(page: Page): Promise<void> {
	const openInspector = page.getByRole("button", {
		name: "Show document inspector",
	});
	if (await openInspector.isVisible()) {
		await openInspector.click();
	}

	const autocompleteEnabled = page
		.locator(".inspector-section")
		.filter({ hasText: "Autocomplete" })
		.locator(".inspector-toggle-row")
		.filter({ hasText: "Enabled" })
		.locator("input[type=checkbox]");
	const suggestionsEnabled = page
		.locator(".inspector-section")
		.filter({ hasText: "AI suggestions" })
		.locator(".inspector-toggle-row")
		.filter({ hasText: "Enabled" })
		.locator("input[type=checkbox]");

	if (await autocompleteEnabled.isChecked()) {
		await autocompleteEnabled.uncheck();
	}
	if (await suggestionsEnabled.isChecked()) {
		await suggestionsEnabled.uncheck();
	}

	const hideInspector = page.getByRole("button", {
		name: "Hide document inspector",
	});
	if (await hideInspector.isVisible()) {
		await hideInspector.click();
	}
}

export async function typeParagraphs(
	page: Page,
	paragraphs: readonly string[],
): Promise<void> {
	const inlines = page.locator("[data-pen-inline-content]");
	const blocks = page.locator("[data-pen-editor-block]");
	await inlines.first().click();
	for (const [index, paragraph] of paragraphs.entries()) {
		await inlines.nth(index).click();
		if (paragraph.length > 0) {
			await page.keyboard.type(paragraph);
		}
		if (index < paragraphs.length - 1) {
			await page.keyboard.press("Enter");
			await expect(blocks).toHaveCount(index + 2);
		}
	}
	await expect(blocks).toHaveCount(paragraphs.length);
}

export async function installKeyDefaultPreventedProbe(
	page: Page,
): Promise<void> {
	await page.evaluate(() => {
		const root = window as Window & {
			__penLiveKeyProbe?: { key: string; defaultPrevented: boolean } | null;
		};
		if (root.__penLiveKeyProbe !== undefined) {
			return;
		}
		root.__penLiveKeyProbe = null;
		window.addEventListener("keydown", (event) => {
			root.__penLiveKeyProbe = {
				key: event.key,
				defaultPrevented: event.defaultPrevented,
			};
		});
	});
}

export async function captureLiveTrace(page: Page): Promise<LiveTrace> {
	return page.evaluate(() => {
		const editor = window.penPlayground?.editor;
		if (!editor) {
			throw new Error("Missing playground editor debug handle.");
		}

		const selection = editor.selection;
		let nextSelection: LiveTraceSelection | null = null;
		if (selection?.type === "text") {
			nextSelection = {
				type: selection.type,
				isCollapsed: selection.isCollapsed,
				isMultiBlock: selection.isMultiBlock,
				anchor: {
					blockId: selection.anchor.blockId,
					offset: selection.anchor.offset,
				},
				focus: {
					blockId: selection.focus.blockId,
					offset: selection.focus.offset,
				},
			};
		} else if (selection?.type === "block") {
			nextSelection = {
				type: selection.type,
				blockIds: [...selection.blockIds],
				head: selection.head ?? null,
			};
		} else if (selection?.type === "cell") {
			nextSelection = {
				type: selection.type,
				blockId: selection.blockId,
				cellAnchor: selection.anchor,
				cellHead: selection.head,
			};
		} else if (selection) {
			nextSelection = { type: selection.type };
		}

		const native = window.getSelection();
		const active = document.activeElement;
		const atoms = [
			...document.querySelectorAll("[data-pen-inline-atom]"),
		];
		const probe = (
			window as Window & {
				__penLiveKeyProbe?: {
					key: string;
					defaultPrevented: boolean;
				} | null;
			}
		).__penLiveKeyProbe;

		return {
			selection: nextSelection,
			selectedText: editor.getSelectedText(),
			blockCount: editor.blockCount(),
			blocks: [...editor.blocks()].map((block) => ({
				id: block.id,
				type: block.type,
				text: block.textContent(),
				length: block.length(),
			})),
			native: {
				isCollapsed: native?.isCollapsed ?? null,
				text: native?.toString() ?? "",
				rangeCount: native?.rangeCount ?? 0,
			},
			overlayCaretCount: document.querySelectorAll(
				"[data-pen-editor-caret]",
			).length,
			selectionRectCount: document.querySelectorAll(
				"[data-pen-selection-rect]",
			).length,
			inlineAtomCount: atoms.length,
			inlineAtomTypes: atoms.map(
				(element) =>
					element.getAttribute("data-pen-inline-atom-type") ?? "",
			),
			activeCaretColor:
				active instanceof HTMLElement
					? getComputedStyle(active).caretColor
					: null,
			keyProbe: probe ?? null,
		};
	});
}

export async function captureSettledLiveTrace(
	page: Page,
	samples = 6,
): Promise<{ immediate: LiveTrace; settled: LiveTrace }> {
	const immediate = await captureLiveTrace(page);
	let settled = immediate;
	for (let index = 0; index < samples; index += 1) {
		await page.waitForTimeout(50);
		const next = await captureLiveTrace(page);
		if (
			JSON.stringify(next.selection) ===
				JSON.stringify(settled.selection) &&
			next.selectedText === settled.selectedText &&
			next.blockCount === settled.blockCount
		) {
			return { immediate, settled: next };
		}
		settled = next;
	}
	return { immediate, settled };
}

export async function recordLiveTrace(
	page: Page,
	name: string,
	extra?: Record<string, unknown>,
): Promise<LiveTrace> {
	const traces = await captureSettledLiveTrace(page);
	writeEvidence(`${name}.json`, { ...traces, ...extra });
	return traces.settled;
}

export async function dragAcrossBlocks(
	page: Page,
	fromIndex: number,
	toIndex: number,
): Promise<void> {
	const inlines = page.locator("[data-pen-inline-content]");
	const start = inlines.nth(fromIndex);
	const end = inlines.nth(toIndex);
	await start.scrollIntoViewIfNeeded();
	const startBox = await start.boundingBox();
	if (!startBox) {
		throw new Error("Missing drag start box.");
	}
	await page.mouse.move(
		startBox.x + 6,
		startBox.y + startBox.height / 2,
	);
	await page.mouse.down();
	await end.scrollIntoViewIfNeeded();
	const endBox = await end.boundingBox();
	if (!endBox) {
		throw new Error("Missing drag end box.");
	}
	await page.mouse.move(endBox.x + 8, endBox.y + endBox.height / 2, {
		steps: 24,
	});
	await page.mouse.up();
}
