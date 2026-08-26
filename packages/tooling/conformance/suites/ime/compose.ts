import type { Page } from "@playwright/test";

export function disableEditContext(): void {
	delete (globalThis as { EditContext?: unknown }).EditContext;
	delete (window as { EditContext?: unknown }).EditContext;
}

export async function readSurfaceText(page: Page): Promise<string> {
	return page.evaluate(
		() =>
			document.querySelector("[data-pen-inline-content]")?.textContent ??
			"",
	);
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

export async function readFocusOffset(page: Page): Promise<number | null> {
	return page.evaluate(() => {
		const selection = window.__penConformance.selection;
		if (selection?.type !== "text") {
			return null;
		}
		return selection.focus.offset;
	});
}

export async function replayCompositionStart(page: Page): Promise<void> {
	await page.evaluate(() => {
		const surface = document.querySelector(
			"[data-pen-field-editor-active-surface], [data-pen-inline-content]",
		);
		if (!(surface instanceof HTMLElement)) {
			throw new Error("no active surface");
		}
		surface.dispatchEvent(
			new CompositionEvent("compositionstart", { bubbles: true }),
		);
	});
}

/**
 * One turn: update + insertCompositionText + DOM append + compositionend.
 * Returns the authority text in that same turn — before any rAF.
 */
export async function replayCompositionCommitSameTurn(
	page: Page,
	text: string,
): Promise<string> {
	return page.evaluate((composed) => {
		const surface = document.querySelector(
			"[data-pen-field-editor-active-surface], [data-pen-inline-content]",
		);
		if (!(surface instanceof HTMLElement)) {
			throw new Error("no active surface");
		}
		surface.dispatchEvent(
			new CompositionEvent("compositionupdate", {
				bubbles: true,
				data: composed,
			}),
		);
		const before = new InputEvent("beforeinput", {
			bubbles: true,
			cancelable: true,
			inputType: "insertCompositionText",
			data: composed,
		});
		Object.defineProperty(before, "inputType", {
			configurable: true,
			value: "insertCompositionText",
		});
		surface.dispatchEvent(before);
		const inline = document.querySelector("[data-pen-inline-content]");
		if (inline instanceof HTMLElement) {
			inline.append(composed);
		}
		surface.dispatchEvent(
			new CompositionEvent("compositionend", {
				bubbles: true,
				data: composed,
			}),
		);
		return window.__penConformance.documentText;
	}, text);
}

export async function dispatchComposingKey(
	page: Page,
	key: string,
): Promise<boolean> {
	return page.evaluate((name) => {
		const surface = document.querySelector(
			"[data-pen-field-editor-active-surface], [data-pen-inline-content]",
		);
		if (!(surface instanceof HTMLElement)) {
			throw new Error("no active surface");
		}
		const event = new KeyboardEvent("keydown", {
			key: name,
			bubbles: true,
			cancelable: true,
			composed: true,
		});
		Object.defineProperty(event, "isComposing", {
			configurable: true,
			value: true,
		});
		surface.dispatchEvent(event);
		return event.defaultPrevented;
	}, key);
}
