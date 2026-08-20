import { afterEach, describe, expect, it } from "vitest";
import { createEditor } from "../index";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

const realCrypto = globalThis.crypto;

function setCrypto(value: unknown): void {
	Object.defineProperty(globalThis, "crypto", {
		value,
		configurable: true,
		writable: true,
	});
}

afterEach(() => {
	setCrypto(realCrypto);
});

// A browser on a plain-http origin — a phone reaching a dev server over the LAN — exposes
// getRandomValues and withholds randomUUID, because randomUUID is secure-context-only.
// Editor construction threw there before HOST4 (audit finding F24). The conformance suite
// covers a real browser; this covers the construction and id-generation paths headlessly.
function enterNonSecureContext(): void {
	setCrypto({ getRandomValues: realCrypto.getRandomValues.bind(realCrypto) });
}

describe("non-secure context (HOST4)", () => {
	it("HOST4: constructs an editor and applies ops without crypto.randomUUID", () => {
		enterNonSecureContext();

		const editor = createEditor({ preset: noDefaultExtensionsPreset });
		editor.apply([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{ type: "insert-text", blockId: "b1", offset: 0, text: "typed on a phone" },
		]);

		expect(editor.getBlock("b1")?.textContent()).toBe("typed on a phone");

		editor.destroy();
	});

	it("HOST4: ids the editor generates itself are well-formed and distinct", () => {
		enterNonSecureContext();

		const editors = Array.from({ length: 50 }, () =>
			createEditor({ preset: noDefaultExtensionsPreset }),
		);
		// the initial paragraph's id comes from the editor, not the caller
		const generatedIds = editors.flatMap((editor) => editor.documentState.blockOrder);

		expect(generatedIds.length).toBe(50);
		expect(new Set(generatedIds).size).toBe(50);
		for (const id of generatedIds) {
			expect(id).toMatch(UUID_V4);
		}

		for (const editor of editors) {
			editor.destroy();
		}
	});

	it("HOST4: also works where Web Crypto is missing entirely", () => {
		setCrypto(undefined);

		const editor = createEditor({ preset: noDefaultExtensionsPreset });
		expect(editor.documentState.blockOrder).toHaveLength(1);

		editor.destroy();
	});
});
