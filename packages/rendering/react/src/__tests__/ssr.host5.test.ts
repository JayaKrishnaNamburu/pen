import { createRequire } from "node:module";
import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { PenEditor } from "../penEditor";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
	JSDOM: new (
		html?: string,
		options?: { url?: string; pretendToBeVisual?: boolean },
	) => {
		readonly window: Window & { close(): void };
	};
};

const MARKER_TEXT = "HOST5-ssr-marker";

function createTestEditor() {
	return createEditor({
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

function fillDocument(editor: ReturnType<typeof createTestEditor>) {
	const blockId = editor.firstBlock()?.id;
	if (!blockId) {
		throw new Error("expected a default block");
	}
	editor.apply([
		{
			type: "insert-text",
			blockId,
			offset: 0,
			text: MARKER_TEXT,
		},
	]);
}

function captureConsole() {
	const errors: unknown[][] = [];
	const warnings: unknown[][] = [];
	const errorSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
		errors.push(args);
	});
	const warnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => {
		warnings.push(args);
	});
	return {
		errors,
		warnings,
		restore() {
			errorSpy.mockRestore();
			warnSpy.mockRestore();
		},
	};
}

function formatConsole(entries: unknown[][]): string {
	return entries
		.map((args) =>
			args
				.map((arg) => (typeof arg === "string" ? arg : String(arg)))
				.join(" "),
		)
		.join("\n");
}

function installDom(html: string): {
	container: HTMLElement;
	cleanup: () => void;
} {
	const dom = new JSDOM(
		`<!DOCTYPE html><html><body><div id="root">${html}</div></body></html>`,
		{
			url: "http://localhost/",
			pretendToBeVisual: true,
		},
	);
	const { window } = dom;
	const assigned: string[] = [];
	for (const key of Object.getOwnPropertyNames(window)) {
		if (key in globalThis) {
			continue;
		}
		(globalThis as Record<string, unknown>)[key] = (
			window as unknown as Record<string, unknown>
		)[key];
		assigned.push(key);
	}
	const previousWindow = (globalThis as { window?: unknown }).window;
	const previousDocument = (globalThis as { document?: unknown }).document;
	(globalThis as { window: unknown }).window = window;
	(globalThis as { document: unknown }).document = window.document;
	(
		globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;

	const container = window.document.getElementById("root");
	if (!container) {
		throw new Error("expected #root");
	}

	return {
		container,
		cleanup() {
			dom.window.close();
			for (const key of assigned) {
				delete (globalThis as Record<string, unknown>)[key];
			}
			if (previousWindow === undefined) {
				delete (globalThis as { window?: unknown }).window;
			} else {
				(globalThis as { window: unknown }).window = previousWindow;
			}
			if (previousDocument === undefined) {
				delete (globalThis as { document?: unknown }).document;
			} else {
				(globalThis as { document: unknown }).document = previousDocument;
			}
		},
	};
}

async function renderAndHydrate(editor: ReturnType<typeof createTestEditor>) {
	const consoleCapture = captureConsole();
	let html = "";
	try {
		html = renderToString(React.createElement(PenEditor, { editor }));
	} catch (error) {
		consoleCapture.restore();
		throw error;
	}

	expect(consoleCapture.errors, formatConsole(consoleCapture.errors)).toEqual(
		[],
	);
	expect(
		consoleCapture.warnings,
		formatConsole(consoleCapture.warnings),
	).toEqual([]);
	expect(html).toContain("data-pen-editor-root");
	expect(html).toContain("data-pen-editor-content");
	expect(html).not.toContain(MARKER_TEXT);

	const { container, cleanup } = installDom(html);
	try {
		await act(async () => {
			hydrateRoot(container, React.createElement(PenEditor, { editor }));
		});
		expect(consoleCapture.errors, formatConsole(consoleCapture.errors)).toEqual(
			[],
		);
		expect(
			consoleCapture.warnings,
			formatConsole(consoleCapture.warnings),
		).toEqual([]);
	} finally {
		cleanup();
		consoleCapture.restore();
		editor.destroy();
	}

	return html;
}

describe("@input/pen-react HOST5 SSR contract", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("HOST5 renders an empty document as a shell then hydrates without warnings", async () => {
		const editor = createTestEditor();
		await renderAndHydrate(editor);
	});

	it("HOST5 renders a non-empty document as a shell then hydrates without warnings", async () => {
		const editor = createTestEditor();
		fillDocument(editor);
		expect(editor.getBlock(editor.firstBlock()!.id)?.textContent()).toContain(
			MARKER_TEXT,
		);
		await renderAndHydrate(editor);
	});
});
