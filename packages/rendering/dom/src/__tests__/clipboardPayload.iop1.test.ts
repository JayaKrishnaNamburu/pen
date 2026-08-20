// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createEditor } from "@input/pen-core";
import {
	PEN_CLIPBOARD_PAYLOAD_VERSION,
	SchemaRegistryImpl,
} from "@input/pen-types";
import { handleCopy } from "../field-editor/clipboard";
import { executePasteTransfer } from "../field-editor/transferPaste";
import type { FieldEditorTransferController } from "../field-editor/controller";
import {
	createPenClipboardPayload,
	decodePenBlocksFromHtml,
	encodePenBlocksForHtml,
	parsePenClipboardPayload,
	PenClipboardFallbackError,
	serializePenClipboardPayload,
	type PenBlock,
} from "../utils/clipboardPayload";

const PARAGRAPH_BLOCK: PenBlock = {
	type: "paragraph",
	props: {},
	content: "Hello world",
	deltas: [{ insert: "Hello world" }],
};

function createClipboardData(): DataTransfer {
	const data = new Map<string, string>();
	return {
		files: [] as unknown as FileList,
		types: [],
		getData(type: string) {
			return data.get(type) ?? "";
		},
		setData(type: string, value: string) {
			data.set(type, value);
		},
	} as unknown as DataTransfer;
}

function createFieldEditorStub(): FieldEditorTransferController {
	return {
		activateTextSelection: vi.fn(),
	} as unknown as FieldEditorTransferController;
}

describe("IOP1 versioned clipboard payload", () => {
	it("IOP1: wraps the common paragraph case in a version-1 envelope", () => {
		const payload = createPenClipboardPayload([PARAGRAPH_BLOCK]);

		expect(payload.version).toBe(PEN_CLIPBOARD_PAYLOAD_VERSION);
		expect(payload.version).toBe(1);
		expect(payload.blockTypes).toEqual(["paragraph"]);
		expect(payload.blocks).toEqual([PARAGRAPH_BLOCK]);
	});

	it("IOP1: same-version JSON flavor round-trips a paragraph without loss", () => {
		const json = serializePenClipboardPayload([PARAGRAPH_BLOCK]);
		const parsed = parsePenClipboardPayload(json);

		expect(parsed.status).toBe("ok");
		if (parsed.status !== "ok") {
			return;
		}
		expect(parsed.payload.version).toBe(1);
		expect(parsed.payload.blockTypes).toEqual(["paragraph"]);
		expect(parsed.payload.blocks).toEqual([PARAGRAPH_BLOCK]);
		expect(parsed.migratedFrom).toBeUndefined();
	});

	it("IOP1: same-version HTML flavor round-trips a paragraph without loss", () => {
		const encoded = encodePenBlocksForHtml(
			JSON.stringify([PARAGRAPH_BLOCK]),
		);
		const blocks = decodePenBlocksFromHtml(encoded);

		expect(blocks).toEqual([PARAGRAPH_BLOCK]);
	});

	it("IOP1: same-registry copy/paste keeps paragraph fidelity", async () => {
		const source = createEditor();
		const target = createEditor();
		const sourceBlockId = source.firstBlock()!.id;
		const targetBlockId = target.firstBlock()!.id;
		const clipboardData = createClipboardData();

		source.apply([
			{
				type: "insert-text",
				blockId: sourceBlockId,
				offset: 0,
				text: "Hello world",
			},
		]);
		source.selectText(sourceBlockId, 0, 11);
		handleCopy(source, { clipboardData } as ClipboardEvent);

		const copied = parsePenClipboardPayload(
			clipboardData.getData("application/x-pen-blocks"),
		);
		expect(copied.status).toBe("ok");
		if (copied.status === "ok") {
			expect(copied.payload.version).toBe(1);
			expect(copied.payload.blockTypes).toEqual(["paragraph"]);
			expect(copied.payload.blocks[0]?.content).toBe("Hello world");
		}

		target.selectText(targetBlockId, 0, 0);
		await executePasteTransfer({
			source: "paste",
			editor: target,
			dataTransfer: clipboardData,
			fieldEditor: createFieldEditorStub(),
		});

		expect(target.getBlock(target.firstBlock()!.id)?.textContent()).toBe(
			"Hello world",
		);

		source.destroy();
		target.destroy();
	});

	it("IOP1: a v1 payload with no version field migrates as version 0", () => {
		const parsed = parsePenClipboardPayload(
			JSON.stringify([PARAGRAPH_BLOCK]),
		);

		expect(parsed.status).toBe("ok");
		if (parsed.status !== "ok") {
			return;
		}
		expect(parsed.migratedFrom).toBe(0);
		expect(parsed.payload.version).toBe(1);
		expect(parsed.payload.blocks).toEqual([PARAGRAPH_BLOCK]);
	});

	it("IOP1: a hand-crafted version-99 payload falls back to HTML and is not half-consumed", () => {
		const secret: PenBlock = {
			type: "paragraph",
			content: "SECRET",
			deltas: [{ insert: "SECRET" }],
		};
		const parsed = parsePenClipboardPayload({
			version: 99,
			blockTypes: ["paragraph"],
			blocks: [secret],
		});

		expect(parsed.status).toBe("fallback");
		if (parsed.status !== "fallback") {
			return;
		}
		expect(parsed.flavor).toBe("html");
		expect(parsed.diagnostic).toMatchObject({
			code: "clipboard-unknown-version",
			level: "warn",
			source: "clipboard",
			payloadVersion: 99,
		});
		expect(parsed).not.toHaveProperty("payload");
	});

	it("IOP1: decode refuses a version-99 HTML payload instead of returning its blocks", () => {
		const encoded = encodePenBlocksForHtml(
			JSON.stringify({
				version: 99,
				blockTypes: ["paragraph"],
				blocks: [PARAGRAPH_BLOCK],
			}),
		);

		expect(() => decodePenBlocksFromHtml(encoded)).toThrow(
			PenClipboardFallbackError,
		);
	});

	it("IOP1: paste of version 99 uses the HTML/plain-text flavor and emits one diagnostic", async () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const diagnostics: unknown[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		const clipboardData = createClipboardData();
		const unknown = JSON.stringify({
			version: 99,
			blockTypes: ["paragraph"],
			blocks: [
				{
					type: "paragraph",
					content: "SECRET",
					deltas: [{ insert: "SECRET" }],
				},
			],
		});
		clipboardData.setData("application/x-pen-blocks", unknown);
		clipboardData.setData(
			"text/html",
			`<meta data-pen-blocks="${encodePenBlocksForHtml(unknown)}" /><p>From HTML</p>`,
		);
		clipboardData.setData("text/plain", "From HTML");

		editor.selectText(blockId, 0, 0);
		await executePasteTransfer({
			source: "paste",
			editor,
			dataTransfer: clipboardData,
			fieldEditor: createFieldEditorStub(),
		});

		expect(editor.getBlock(blockId)?.textContent()).toBe("From HTML");
		expect(diagnostics).toEqual([
			expect.objectContaining({
				code: "clipboard-unknown-version",
				payloadVersion: 99,
			}),
		]);

		editor.destroy();
	});

	it("IOP1: JSON flavor retains a type absent from the receiving registry", () => {
		const extra: PenBlock = {
			type: "customWidget",
			props: { kind: "callout" },
			content: "Keep me",
		};
		const json = serializePenClipboardPayload([PARAGRAPH_BLOCK, extra]);
		const parsed = parsePenClipboardPayload(json);

		expect(parsed.status).toBe("ok");
		if (parsed.status !== "ok") {
			return;
		}
		expect(parsed.payload.blockTypes).toEqual([
			"customWidget",
			"paragraph",
		]);
		expect(parsed.payload.blocks.map((block) => block.type)).toEqual([
			"paragraph",
			"customWidget",
		]);
		expect(parsed.payload.blocks[1]).toEqual(extra);

		const receiving = new SchemaRegistryImpl({
			onUnknownBlock: () => "passthrough",
		});
		expect(receiving.resolve("customWidget")?.type).toBe("customWidget");
		expect(
			receiving.allBlocks().some((block) => block.type === "customWidget"),
		).toBe(false);
		// V.3 passthrough is wired on resolve. Apply still refuses new inserts
		// of types outside allBlocks() (PEN_APPLY_002). React/Vue DefaultRenderer
		// covers stored unknown blocks only — the paste-insert renderer gap.
	});
});
