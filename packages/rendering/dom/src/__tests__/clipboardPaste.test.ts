import { describe, expect, it, vi } from "vitest";
import { createEditor } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import { executePasteTransfer } from "../field-editor/transferPaste";
import type { FieldEditorTransferController } from "../field-editor/controller";
import {
	PEN_CLIPBOARD_PAYLOAD_VERSION,
	parsePenClipboardPayload,
} from "../utils/clipboardPayload";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createBareEditor(): Editor {
	return createEditor({
		preset: noDefaultExtensionsPreset,
	});
}

function createClipboardData(entries: Record<string, string>): DataTransfer {
	const data = new Map(Object.entries(entries));
	return {
		files: [] as unknown as FileList,
		types: [...data.keys()],
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
	};
}

function hostileHeadingPayload(content: string): string {
	return [
		"{",
		`"version":${PEN_CLIPBOARD_PAYLOAD_VERSION},`,
		'"blockTypes":["heading"],',
		'"blocks":[{',
		'"type":"heading",',
		'"props":{"level":1,"safe":"kept","__proto__":{"polluted":true},"constructor":{"polluted":true},"prototype":{"polluted":true}},',
		`"content":${JSON.stringify(content)},`,
		`"deltas":[{"insert":${JSON.stringify(content)},"attributes":{"bold":true,"__proto__":{"polluted":true}}}]`,
		"}]}",
	].join("");
}

describe("clipboard JSON-flavor paste", () => {
	it("SEC4: rejects __proto__, constructor, and prototype own keys", () => {
		const result = parsePenClipboardPayload(hostileHeadingPayload("Safe"));

		expect(result.status).toBe("ok");
		if (result.status !== "ok") {
			return;
		}

		const [block] = result.payload.blocks;
		expect(block).toBeDefined();
		expect(Object.getPrototypeOf(block)).toBeNull();
		expect(Object.getPrototypeOf(block?.props)).toBeNull();
		expect(Object.hasOwn(block?.props ?? {}, "__proto__")).toBe(false);
		expect(Object.hasOwn(block?.props ?? {}, "constructor")).toBe(false);
		expect(Object.hasOwn(block?.props ?? {}, "prototype")).toBe(false);
		expect(block?.props).toEqual({ level: 1, safe: "kept" });
		expect(Object.hasOwn(block?.deltas?.[0]?.attributes ?? {}, "__proto__")).toBe(
			false,
		);
		expect(
			(Object.prototype as { polluted?: boolean }).polluted,
		).toBeUndefined();
	});

	it("SEC4: proto-key JSON flavor paste does not pollute and keeps safe fields", async () => {
		const editor = createBareEditor();
		const emptyBlockId = editor.firstBlock()!.id;
		editor.selectText(emptyBlockId, 0, 0);

		const handled = await executePasteTransfer({
			source: "paste",
			editor,
			fieldEditor: createFieldEditorStub(),
			dataTransfer: createClipboardData({
				"application/x-pen-blocks": hostileHeadingPayload("Kept"),
			}),
		});

		expect(handled).toBe(true);
		const block = editor.getBlock(editor.documentState.blockOrder[0]!)!;
		expect(block.type).toBe("heading");
		expect(block.textContent()).toBe("Kept");
		expect(Object.hasOwn(block.props, "__proto__")).toBe(false);
		expect(Object.hasOwn(block.props, "constructor")).toBe(false);
		expect(Object.hasOwn(block.props, "prototype")).toBe(false);
		expect(block.props).toMatchObject({ level: 1 });
		expect(
			(Object.prototype as { polluted?: boolean }).polluted,
		).toBeUndefined();

		editor.destroy();
	});
});
