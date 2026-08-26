import { describe, expect, it } from "vitest";
import {
	assignMultiplayerColor,
	MULTIPLAYER_COLORS,
	normalizeMultiplayerColor,
} from "../presence/colorAssignment";

describe("assignMultiplayerColor", () => {
	it("returns the same color for the same user id", () => {
		expect(assignMultiplayerColor("user-1")).toBe(
			assignMultiplayerColor("user-1"),
		);
	});

	it("returns a color from the exported palette", () => {
		expect(MULTIPLAYER_COLORS).toContain(assignMultiplayerColor("someone"));
		expect(MULTIPLAYER_COLORS).toContain(assignMultiplayerColor(""));
	});

	it("every palette entry is a hex color normalize accepts", () => {
		for (const color of MULTIPLAYER_COLORS) {
			expect(normalizeMultiplayerColor(color, "#000000")).toBe(color);
		}
	});
});

describe("normalizeMultiplayerColor", () => {
	it("preserves valid colors", () => {
		expect(normalizeMultiplayerColor("#abc123", "#000000")).toBe("#abc123");
		expect(normalizeMultiplayerColor("rgb(1 2 3)", "#000000")).toBe(
			"rgb(1 2 3)",
		);
		expect(normalizeMultiplayerColor("var(--brand-color)", "#000000")).toBe(
			"var(--brand-color)",
		);
	});

	it("falls back for invalid colors", () => {
		expect(normalizeMultiplayerColor("red;position:absolute", "#000000")).toBe(
			"#000000",
		);
		expect(normalizeMultiplayerColor(undefined, "#000000")).toBe("#000000");
	});
});
