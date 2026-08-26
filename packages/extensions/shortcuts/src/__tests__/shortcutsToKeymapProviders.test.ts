import { describe, expect, it } from "vitest";
import {
	createFacetRegistry,
	keyBindingPriorityToPrecedence,
	keymapFacet,
} from "@input/pen-core";
import type { KeyBinding } from "@input/pen-types";
import {
	PEN_KEYMAP_FACET_NAME,
	shortcutsToKeymapProviders,
} from "../index";

function binding(
	key: string,
	priority?: number,
	handler: KeyBinding["handler"] = () => false,
): KeyBinding {
	return priority === undefined
		? { key, handler }
		: { key, priority, handler };
}

describe("K2 / 4.3 shortcutsToKeymapProviders", () => {
	it("K2 / 4.3: emits one pen.keymap provider per binding", () => {
		const providers = shortcutsToKeymapProviders([
			binding("Mod-b", 100),
			binding("Mod-i", 100),
			binding("Mod-u", 100),
		]);

		expect(providers).toHaveLength(3);
		expect(
			providers.every(
				(provider) =>
					provider.facetName === PEN_KEYMAP_FACET_NAME &&
					provider.precedence === "highest",
			),
		).toBe(true);
	});

	it("K2 / 4.3: maps undeclared priority through the shim default of 300", () => {
		const providers = shortcutsToKeymapProviders([binding("Mod-k")]);

		expect(providers).toHaveLength(1);
		expect(providers[0]?.precedence).toBe(
			keyBindingPriorityToPrecedence(300),
		);
		expect(providers[0]?.precedence).toBe("default");
	});

	it("4.3: maps an empty list to no providers", () => {
		expect(shortcutsToKeymapProviders([])).toEqual([]);
	});
});

describe("K1 shortcuts keymap precedence", () => {
	it("K1: a priority-100 provider wins against an undeclared-priority competitor", () => {
		let winner: string | null = null;
		const high = binding("Mod-b", 100, () => {
			winner = "highest";
			return true;
		});
		const fallback = binding("Mod-b", undefined, () => {
			winner = "default";
			return true;
		});

		const registry = createFacetRegistry({
			providers: shortcutsToKeymapProviders([fallback, high]),
		});
		registry.markReady();

		for (const next of registry.read(keymapFacet)) {
			if (next.key !== "Mod-b") continue;
			if (next.handler({} as never, {} as KeyboardEvent)) break;
		}

		expect(winner).toBe("highest");
		expect(keyBindingPriorityToPrecedence(100)).toBe("highest");
		expect(keyBindingPriorityToPrecedence(300)).toBe("default");
	});

	it("K1: an undeclared-priority provider loses to a priority-100 competitor", () => {
		let winner: string | null = null;
		const fallback = binding("Mod-b", undefined, () => {
			winner = "default";
			return true;
		});
		const high = binding("Mod-b", 100, () => {
			winner = "highest";
			return true;
		});

		const registry = createFacetRegistry({
			providers: shortcutsToKeymapProviders([fallback, high]),
		});
		registry.markReady();

		for (const next of registry.read(keymapFacet)) {
			if (next.key !== "Mod-b") continue;
			if (next.handler({} as never, {} as KeyboardEvent)) break;
		}

		expect(winner).toBe("highest");
	});
});
