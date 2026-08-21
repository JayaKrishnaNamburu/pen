import { describe, expect, it } from "vitest";
import { EMPTY_BLOCK_SENTINEL, type Editor } from "@input/pen-types";
import {
	serializeDeltasToFormat,
	writePenClipboard,
} from "../utils/clipboardSerialization";

function stubEditor(): Editor {
	return {
		schema: {
			resolveInline() {
				return undefined;
			},
		},
	} as unknown as Editor;
}

function createClipboardEvent(): {
	event: ClipboardEvent;
	get: (type: string) => string;
} {
	const data = new Map<string, string>();
	const clipboardData = {
		setData(type: string, value: string) {
			data.set(type, value);
		},
		getData(type: string) {
			return data.get(type) ?? "";
		},
	} as unknown as DataTransfer;
	return {
		event: { clipboardData } as ClipboardEvent,
		get: (type: string) => data.get(type) ?? "",
	};
}

describe("I11 clipboard serialization", () => {
	it("I11: writePenClipboard strips an empty-block sentinel from text/plain", () => {
		const { event, get } = createClipboardEvent();
		writePenClipboard([], "", EMPTY_BLOCK_SENTINEL, event);

		expect(get("text/plain")).toBe("");
		expect(get("text/plain")).not.toContain(EMPTY_BLOCK_SENTINEL);
	});

	it("I11: writePenClipboard strips embedded sentinels from mixed plain text", () => {
		const { event, get } = createClipboardEvent();
		writePenClipboard([], "", `Hello${EMPTY_BLOCK_SENTINEL} world`, event);

		expect(get("text/plain")).toBe("Hello world");
	});

	it("I11: writePenClipboard leaves user text unchanged", () => {
		const { event, get } = createClipboardEvent();
		writePenClipboard([], "", "Hello world", event);

		expect(get("text/plain")).toBe("Hello world");
	});

	it("I11: serializeDeltasToFormat omits a sentinel-only delta", () => {
		const html = serializeDeltasToFormat(
			[{ insert: EMPTY_BLOCK_SENTINEL }],
			stubEditor(),
			"html",
		);

		expect(html).toBe("");
		expect(html).not.toContain(EMPTY_BLOCK_SENTINEL);
	});

	it("I11: serializeDeltasToFormat strips sentinels from mixed delta text", () => {
		const markdown = serializeDeltasToFormat(
			[
				{ insert: `Hi${EMPTY_BLOCK_SENTINEL}` },
				{ insert: EMPTY_BLOCK_SENTINEL },
				{ insert: " there" },
			],
			stubEditor(),
			"markdown",
		);

		expect(markdown).toBe("Hi there");
		expect(markdown).not.toContain(EMPTY_BLOCK_SENTINEL);
	});
});
