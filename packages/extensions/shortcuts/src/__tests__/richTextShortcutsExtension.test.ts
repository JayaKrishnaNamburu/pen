import { describe, expect, it } from "vitest";
import { richTextShortcutsExtension } from "../index";

describe("@pen/shortcuts", () => {
	it("creates default rich-text shortcut bindings", () => {
		const extension = richTextShortcutsExtension();

		expect(extension.name).toBe("rich-text-shortcuts");
		expect(extension.keyBindings?.map((binding) => binding.key)).toEqual([
			"Mod-b",
			"Mod-i",
			"Mod-u",
		]);
	});
});
