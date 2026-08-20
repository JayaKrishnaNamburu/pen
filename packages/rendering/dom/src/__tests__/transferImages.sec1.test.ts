import { describe, expect, it } from "vitest";
import { createHeadlessEditor } from "@input/pen-core";
import type { DiagnosticEvent } from "@input/pen-types";
import {
	insertUploadedImages,
	insertUploadedImagesAtDropTarget,
} from "../field-editor/transferImages";

function createEditor() {
	return createHeadlessEditor();
}

function imageBlocks(editor: ReturnType<typeof createEditor>) {
	return editor.documentState.blockOrder
		.map((id) => editor.getBlock(id))
		.filter((block) => block?.type === "image");
}

function listenDiagnostics(editor: ReturnType<typeof createEditor>) {
	const diagnostics: DiagnosticEvent[] = [];
	editor.on("diagnostic", (event) => {
		diagnostics.push(event);
	});
	return diagnostics;
}

describe("SEC1 transfer image src", () => {
	it("SEC1: javascript: image src is omitted and diagnosed", () => {
		const editor = createEditor();
		const diagnostics = listenDiagnostics(editor);

		const result = insertUploadedImages(
			editor,
			[{ src: "javascript:alert(1)", alt: "hostile js" }],
			"last",
		);

		expect(result.lastInsertedBlockId).toBeNull();
		expect(imageBlocks(editor)).toHaveLength(0);
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "asset-blocked-url",
				level: "warn",
				source: "assets",
				scheme: "javascript:",
			}),
		);
		expect(JSON.stringify(diagnostics)).not.toContain("javascript:alert(1)");

		editor.destroy();
	});

	it("SEC1: data:text/html image src is omitted and diagnosed", () => {
		const editor = createEditor();
		const diagnostics = listenDiagnostics(editor);

		insertUploadedImages(
			editor,
			[
				{
					src: "data:text/html,<script>alert(1)</script>",
					alt: "hostile html",
				},
			],
			"last",
		);

		expect(imageBlocks(editor)).toHaveLength(0);
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "asset-blocked-url",
				scheme: "data:",
			}),
		);
		expect(JSON.stringify(diagnostics)).not.toContain("data:text/html");
		expect(JSON.stringify(diagnostics)).not.toContain("<script>");

		editor.destroy();
	});

	it("SEC1: mixed-case javascript: image src is omitted", () => {
		const editor = createEditor();
		const diagnostics = listenDiagnostics(editor);

		insertUploadedImages(
			editor,
			[{ src: "JaVaScRiPt:alert(1)", alt: "obfuscated" }],
			"last",
		);

		expect(imageBlocks(editor)).toHaveLength(0);
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "asset-blocked-url",
				scheme: "javascript:",
			}),
		);

		editor.destroy();
	});

	it("SEC1: https and data:image src are written", () => {
		const editor = createEditor();
		const diagnostics = listenDiagnostics(editor);
		const png =
			"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

		insertUploadedImages(
			editor,
			[
				{ src: "https://cdn.example.com/photo.png", alt: "remote" },
				{ src: png, alt: "inline png" },
			],
			"last",
		);

		const images = imageBlocks(editor);
		expect(images).toHaveLength(2);
		expect(images[0]?.props).toMatchObject({
			src: "https://cdn.example.com/photo.png",
			alt: "remote",
		});
		expect(images[1]?.props).toMatchObject({
			src: png,
			alt: "inline png",
		});
		expect(
			diagnostics.filter((event) => event.code === "asset-blocked-url"),
		).toHaveLength(0);

		editor.destroy();
	});

	it("SEC1: host/custom schemes are stored raw (no pre-launder)", () => {
		const editor = createEditor();
		const diagnostics = listenDiagnostics(editor);

		insertUploadedImages(
			editor,
			[
				{ src: "memory://photo.png", alt: "memory" },
				{ src: "blob:https://pen.invalid/asset-1", alt: "blob" },
			],
			"last",
		);

		const images = imageBlocks(editor);
		expect(images).toHaveLength(2);
		expect(images[0]?.props).toMatchObject({
			src: "memory://photo.png",
			alt: "memory",
		});
		expect(images[1]?.props).toMatchObject({
			src: "blob:https://pen.invalid/asset-1",
			alt: "blob",
		});
		expect(
			diagnostics.filter((event) => event.code === "asset-blocked-url"),
		).toHaveLength(0);

		editor.destroy();
	});

	it("SEC1: mixed batch writes allowed src and omits hostile src", () => {
		const editor = createEditor();
		const diagnostics = listenDiagnostics(editor);

		insertUploadedImages(
			editor,
			[
				{ src: "https://cdn.example.com/ok.png", alt: "ok" },
				{ src: "javascript:alert(1)", alt: "blocked" },
				{ src: "memory://kept.png", alt: "kept" },
			],
			"last",
		);

		const images = imageBlocks(editor);
		expect(images).toHaveLength(2);
		expect(images.map((block) => block?.props.src)).toEqual([
			"https://cdn.example.com/ok.png",
			"memory://kept.png",
		]);
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "asset-blocked-url",
				scheme: "javascript:",
			}),
		);

		editor.destroy();
	});

	it("SEC1: drop-target split omits javascript: src and does not split", () => {
		const editor = createEditor();
		const diagnostics = listenDiagnostics(editor);
		const paragraphId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-text",
				blockId: paragraphId,
				offset: 0,
				text: "Hello",
			},
		]);

		const inserted = insertUploadedImagesAtDropTarget(
			editor,
			[{ src: "javascript:alert(1)", alt: "hostile" }],
			{
				kind: "inline",
				point: { blockId: paragraphId, offset: 2 },
			},
		);

		expect(inserted).toBeNull();
		expect(imageBlocks(editor)).toHaveLength(0);
		expect(editor.getBlock(paragraphId)?.textContent()).toBe("Hello");
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "asset-blocked-url",
				scheme: "javascript:",
			}),
		);

		editor.destroy();
	});

	it("SEC1: drop-target split writes https src and not data:text/html", () => {
		const editor = createEditor();
		const diagnostics = listenDiagnostics(editor);
		const paragraphId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-text",
				blockId: paragraphId,
				offset: 0,
				text: "Hello",
			},
		]);

		const inserted = insertUploadedImagesAtDropTarget(
			editor,
			[
				{ src: "https://cdn.example.com/ok.png", alt: "ok" },
				{ src: "data:text/html,<h1>no</h1>", alt: "html" },
			],
			{
				kind: "inline",
				point: { blockId: paragraphId, offset: 2 },
			},
		);

		expect(inserted).not.toBeNull();
		const images = imageBlocks(editor);
		expect(images).toHaveLength(1);
		expect(images[0]?.props).toMatchObject({
			src: "https://cdn.example.com/ok.png",
			alt: "ok",
		});
		expect(images[0]?.id).toBe(inserted);
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "asset-blocked-url",
				scheme: "data:",
			}),
		);
		expect(JSON.stringify(diagnostics)).not.toContain("data:text/html");

		editor.destroy();
	});
});
