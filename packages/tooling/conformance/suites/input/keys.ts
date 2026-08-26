import type { Page } from "@playwright/test";

export type KeyProbe = {
	key: string;
	defaultPrevented: boolean;
	isComposing: boolean;
};

export async function installKeyProbe(page: Page): Promise<void> {
	await page.evaluate(() => {
		(
			window as Window & { __penKeyProbe?: KeyProbe[] }
		).__penKeyProbe = [];
		document.addEventListener("keydown", (event) => {
			(
				window as Window & { __penKeyProbe?: KeyProbe[] }
			).__penKeyProbe?.push({
				key: event.key,
				defaultPrevented: event.defaultPrevented,
				isComposing: event.isComposing,
			});
		});
	});
}

export async function readKeyProbe(page: Page): Promise<KeyProbe[]> {
	return page.evaluate(
		() =>
			(window as Window & { __penKeyProbe?: KeyProbe[] }).__penKeyProbe ??
			[],
	);
}

export async function readFocusOffset(page: Page): Promise<number | null> {
	return page.evaluate(() => {
		const selection = window.__penConformance.selection;
		if (selection?.type !== "text") {
			return null;
		}
		return selection.focus.offset;
	});
}

export async function readDocumentText(page: Page): Promise<string> {
	return page.evaluate(() => window.__penConformance.documentText);
}

export async function readBackend(page: Page): Promise<{
	contentEditable: string;
	hasEditContext: boolean;
}> {
	return page.evaluate(() => {
		const surface = document.querySelector(
			"[data-pen-field-editor-active-surface], [data-pen-inline-content]",
		);
		if (!(surface instanceof HTMLElement)) {
			throw new Error("no active surface");
		}
		return {
			contentEditable: surface.contentEditable,
			hasEditContext: Boolean(
				(surface as HTMLElement & { editContext?: unknown }).editContext,
			),
		};
	});
}
