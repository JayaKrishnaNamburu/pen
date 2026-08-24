import { describe, expect, it } from "vitest";
import type { Editor } from "@input/pen-types";
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
	it("I11: writePenClipboard emits empty text/plain for an empty block", () => {
		const { event, get } = createClipboardEvent();
		writePenClipboard([], "", "", event);

		expect(get("text/plain")).toBe("");
	});

	it("I11: writePenClipboard leaves user text unchanged", () => {
		const { event, get } = createClipboardEvent();
		writePenClipboard([], "", "Hello world", event);

		expect(get("text/plain")).toBe("Hello world");
	});

	it("I11: serializeDeltasToFormat omits an empty-block delta", () => {
		const html = serializeDeltasToFormat(
			[{ insert: "" }],
			stubEditor(),
			"html",
		);

		expect(html).toBe("");
	});
});
