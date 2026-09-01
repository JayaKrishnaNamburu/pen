import {
	createHeadlessEditor,
	smoothStreamControllerFacet,
} from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import type { Editor, InlineDecoration, OpOrigin } from "@input/pen-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	SMOOTH_STREAM_EXTENSION_NAME,
	getSmoothStreamController,
	smoothStreamExtension,
	type SmoothStreamController,
	type SmoothStreamStatus,
} from "../smoothStreamExtension";

const editors: Editor[] = [];

beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["setInterval", "clearInterval"],
	});
});

afterEach(async () => {
	await Promise.all(editors.splice(0).map((editor) => editor.destroy()));
	vi.useRealTimers();
});

async function openEditor(
	options?: Parameters<typeof smoothStreamExtension>[0],
): Promise<{
	editor: Editor;
	blockId: string;
	controller: SmoothStreamController;
}> {
	const editor = createHeadlessEditor({
		schema: defaultSchema,
		extensions: [smoothStreamExtension(options)],
	});
	editors.push(editor);
	await editor.whenReady();

	const blockId = editor.firstBlock()?.id;
	if (blockId === undefined) {
		throw new Error("expected an initial paragraph");
	}

	const controller = getSmoothStreamController(editor);
	if (controller === null) {
		throw new Error("smooth stream controller missing");
	}

	return { editor, blockId, controller };
}

function applyText(
	editor: Editor,
	blockId: string,
	insert: string,
	origin: OpOrigin,
	from = editor.getBlock(blockId)?.length() ?? 0,
): void {
	editor.apply(
		[
			{
				type: "splice-text",
				blockId,
				from,
				to: from,
				insert,
			},
		],
		{ origin },
	);
}

function streamAppend(editor: Editor, blockId: string, insert: string): void {
	const writer = editor.openTextStream(
		{ blockId },
		{ origin: { type: "ai" }, flushIntervalMs: 16 },
	);
	writer.append(insert);
	writer.flush();
	writer.close();
}

function visibleText(editor: Editor, blockId: string): string {
	const text = editor.getBlock(blockId)?.textContent() ?? "";
	const hidden = editor
		.getDecorations()
		.inlineForBlock(blockId)
		.find(
			(decoration: InlineDecoration) =>
				decoration.omitFromRender === true,
		);
	return hidden === undefined ? text : text.slice(0, hidden.from);
}

describe("@input/pen-ai/stream smoothStreamExtension", () => {
	it("SM2: getSmoothStreamController resolves through the facet and is null without the extension", async () => {
		const { editor, controller } = await openEditor();
		expect(controller).toBe(editor.facet(smoothStreamControllerFacet));

		const bare = createHeadlessEditor({ schema: defaultSchema });
		editors.push(bare);
		await bare.whenReady();
		expect(getSmoothStreamController(bare)).toBeNull();
	});

	it("ST7: streamed text is withheld from paint while user text is not", async () => {
		const { editor, blockId, controller } = await openEditor();

		streamAppend(editor, blockId, "Hello world");
		expect(visibleText(editor, blockId)).toBe("");
		expect(editor.getBlock(blockId)?.textContent()).toBe("Hello world");
		expect(controller.hasHiddenText()).toBe(true);
		expect(controller.isRevealing()).toBe(true);

		const [decoration] = editor
			.getDecorations()
			.inlineForBlock(blockId)
			.filter((item) => item.omitFromRender === true);
		expect(decoration).toMatchObject({
			from: 0,
			to: "Hello world".length,
			omitFromRender: true,
			key: `${SMOOTH_STREAM_EXTENSION_NAME}:${blockId}`,
		});

		const userEditor = createHeadlessEditor({
			schema: defaultSchema,
			extensions: [smoothStreamExtension()],
		});
		editors.push(userEditor);
		await userEditor.whenReady();
		const userBlockId = userEditor.firstBlock()!.id;
		applyText(userEditor, userBlockId, "Typed by the reader", "user");
		expect(visibleText(userEditor, userBlockId)).toBe(
			"Typed by the reader",
		);
		expect(getSmoothStreamController(userEditor)?.hasHiddenText()).toBe(
			false,
		);
	});

	it("ST7: an accepted-autocomplete apply is not withheld", async () => {
		const { editor, blockId, controller } = await openEditor();

		applyText(editor, blockId, "accepted completion", {
			type: "ai",
			groupId: "request-1",
		});

		expect(visibleText(editor, blockId)).toBe("accepted completion");
		expect(controller.hasHiddenText()).toBe(false);
		expect(controller.isRevealing()).toBe(false);
	});

	it("ST7: a caller-supplied shouldPace can opt AI-origin applies back in", async () => {
		const { editor, blockId, controller } = await openEditor({
			shouldPace: (event) => event.origin.type === "ai",
		});

		applyText(editor, blockId, "opted back in", {
			type: "ai",
			groupId: "request-1",
		});

		expect(visibleText(editor, blockId)).toBe("");
		expect(controller.hasHiddenText()).toBe(true);
	});

	it("ST8: hide never moves an existing frontier forward", async () => {
		const { editor, blockId, controller } = await openEditor();

		streamAppend(editor, blockId, "Hello world");
		controller.hide(blockId, 6);
		expect(visibleText(editor, blockId)).toBe("");

		controller.hide(blockId, 11);
		expect(visibleText(editor, blockId)).toBe("");
		expect(
			editor
				.getDecorations()
				.inlineForBlock(blockId)
				.find((decoration) => decoration.omitFromRender === true)?.from,
		).toBe(0);
	});

	it("ST8: a mid-block splice leaves trailing text visible", async () => {
		const { editor, blockId, controller } = await openEditor();

		applyText(editor, blockId, "Hello world", "user");
		const writer = editor.openTextStream(
			{ blockId },
			{ origin: { type: "ai" }, flushIntervalMs: 16 },
		);
		writer.splice(6, 6, "there ");
		writer.flush();
		writer.close();

		expect(editor.getBlock(blockId)?.textContent()).toBe(
			"Hello there world",
		);
		expect(visibleText(editor, blockId)).toBe("Hello there world");
		expect(controller.hasHiddenText()).toBe(false);
	});

	it("ST8: a newly inserted paragraph is withheld from 0", async () => {
		const { editor, blockId, controller } = await openEditor();

		const insertedId = "smooth-stream-p2";
		editor.apply(
			[
				{
					type: "insert-block",
					blockId: insertedId,
					blockType: "paragraph",
					props: {},
					position: { after: blockId },
				},
			],
			{ origin: { type: "ai", source: "stream" } },
		);
		streamAppend(editor, insertedId, "Second paragraph");

		expect(visibleText(editor, insertedId)).toBe("");
		expect(controller.hasHiddenText()).toBe(true);
	});

	it("ST9: reveals a word at a time in document order", async () => {
		const { editor, blockId, controller } = await openEditor();

		streamAppend(editor, blockId, "Hey Noud, join me");
		expect(controller.revealNext()).toBe(true);
		expect(visibleText(editor, blockId)).toBe("Hey ");
		expect(controller.revealNext()).toBe(true);
		expect(visibleText(editor, blockId)).toBe("Hey Noud, ");
	});

	it("ST9: a large burst catches up instead of one unit per tick", async () => {
		const { editor, blockId, controller } = await openEditor({
			intervalMs: 20,
			drainMs: 1000,
		});

		streamAppend(editor, blockId, "x ".repeat(500));
		expect(controller.hiddenCharCount()).toBe(1000);

		vi.advanceTimersByTime(20);
		expect(visibleText(editor, blockId)).toBe("x ".repeat(10));
		expect(controller.hiddenCharCount()).toBe(980);
	});

	it("ST9: flush on a user commit, on disable, and on teardown", async () => {
		const { editor, blockId, controller } = await openEditor();

		streamAppend(editor, blockId, "Hidden until the reader types");
		expect(controller.hasHiddenText()).toBe(true);

		applyText(editor, blockId, "!", "user");
		expect(controller.hasHiddenText()).toBe(false);
		expect(visibleText(editor, blockId)).toBe(
			"Hidden until the reader types!",
		);
		expect(controller.isRevealing()).toBe(false);

		streamAppend(editor, blockId, " more");
		expect(controller.hasHiddenText()).toBe(true);
		controller.setEnabled(false);
		expect(controller.isEnabled()).toBe(false);
		expect(controller.hasHiddenText()).toBe(false);
		expect(controller.isRevealing()).toBe(false);

		controller.setEnabled(true);
		streamAppend(editor, blockId, " again");
		expect(controller.hasHiddenText()).toBe(true);
		await editor.destroy();
		editors.splice(editors.indexOf(editor), 1);
		expect(getSmoothStreamController(editor)).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("ST9: setEnabled notifies subscribers when nothing is withheld", async () => {
		const { controller } = await openEditor();
		const statuses: SmoothStreamStatus[] = [];
		controller.subscribe((status) => {
			statuses.push(status);
		});

		controller.setEnabled(false);
		expect(controller.isEnabled()).toBe(false);
		expect(statuses.at(-1)).toEqual({
			enabled: false,
			isRevealing: false,
			hiddenCharCount: 0,
		});

		controller.setEnabled(true);
		expect(controller.isEnabled()).toBe(true);
		expect(statuses.at(-1)).toEqual({
			enabled: true,
			isRevealing: false,
			hiddenCharCount: 0,
		});
	});

	it("ST9: character granularity releases the catch-up budget exactly", async () => {
		const { editor, blockId, controller } = await openEditor({
			granularity: "character",
			intervalMs: 20,
			drainMs: 1000,
		});

		streamAppend(editor, blockId, "a".repeat(100));
		vi.advanceTimersByTime(20);
		expect(visibleText(editor, blockId)).toBe("aa");
		expect(controller.hiddenCharCount()).toBe(98);
	});
});
