// @vitest-environment jsdom

import type { DiagnosticEvent, Editor } from "@input/pen-types";
import { afterEach, describe, expect, it, vi } from "vitest";

import { writePenClipboard } from "../utils/clipboardSerialization";

function stubEditor(onDiagnostic: (event: DiagnosticEvent) => void): Editor {
	return {
		internals: {
			emit(event: string, payload: unknown) {
				if (event === "diagnostic") {
					onDiagnostic(payload as DiagnosticEvent);
				}
			},
		},
	} as Editor;
}

describe("clipboard serialization (CH5)", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("CH5: emits a diagnostic when clipboard write and writeText reject", async () => {
		const diagnostics: DiagnosticEvent[] = [];
		vi.stubGlobal("navigator", {
			clipboard: {
				write: () => Promise.reject(new Error("denied")),
				writeText: () => Promise.reject(new Error("denied")),
			},
		});
		vi.stubGlobal(
			"ClipboardItem",
			class {
				constructor(public readonly items: Record<string, Blob>) {}
			},
		);

		writePenClipboard([], "", "copied", undefined, stubEditor((event) => {
			diagnostics.push(event);
		}));

		await vi.waitFor(() => {
			expect(diagnostics).toHaveLength(1);
		});
		expect(diagnostics[0]).toEqual(
			expect.objectContaining({
				code: "PEN_CLIPBOARD_002",
				level: "warn",
				source: "clipboard",
				remediation: expect.any(String),
			}),
		);
	});
});
