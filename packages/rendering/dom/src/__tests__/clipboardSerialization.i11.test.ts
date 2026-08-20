import { describe, expect, it } from "vitest";
import type { Editor } from "@input/pen-types";
import {
	serializeDeltasToFormat,
	writePenClipboard,
} from "../utils/clipboardSerialization";

const STORAGE_SENTINEL = "\u200B";

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
		writePenClipboard([], "", STORAGE_SENTINEL, event);

		expect(get("text/plain")).toBe("");
		expect(get("text/plain")).not.toContain(STORAGE_SENTINEL);
	});

	it("I11: writePenClipboard strips embedded sentinels from mixed plain text", () => {
		const { event, get } = createClipboardEvent();
		writePenClipboard([], "", `Hello${STORAGE_SENTINEL} world`, event);

		expect(get("text/plain")).toBe("Hello world");
	});

	it("I11: writePenClipboard leaves user text unchanged", () => {
		const { event, get } = createClipboardEvent();
		writePenClipboard([], "", "Hello world", event);

		expect(get("text/plain")).toBe("Hello world");
	});

	it("I11: serializeDeltasToFormat omits a sentinel-only delta", () => {
		const html = serializeDeltasToFormat(
			[{ insert: STORAGE_SENTINEL }],
			stubEditor(),
			"html",
		);

		expect(html).toBe("");
		expect(html).not.toContain(STORAGE_SENTINEL);
	});

	it("I11: serializeDeltasToFormat strips sentinels from mixed delta text", () => {
		const markdown = serializeDeltasToFormat(
			[
				{ insert: `Hi${STORAGE_SENTINEL}` },
				{ insert: STORAGE_SENTINEL },
				{ insert: " there" },
			],
			stubEditor(),
			"markdown",
		);

		expect(markdown).toBe("Hi there");
		expect(markdown).not.toContain(STORAGE_SENTINEL);
	});
});
