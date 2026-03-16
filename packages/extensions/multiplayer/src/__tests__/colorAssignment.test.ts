import { describe, expect, it } from "vitest";
import {
	assignMultiplayerColor,
	normalizeMultiplayerColor,
} from "../presence/colorAssignment";

const MULTIPLAYER_COLORS = new Set([
	"#2563eb",
	"#dc2626",
	"#16a34a",
	"#ca8a04",
	"#9333ea",
	"#0891b2",
	"#e11d48",
	"#65a30d",
	"#7c3aed",
	"#059669",
	"#d97706",
	"#4f46e5",
]);

describe("assignMultiplayerColor", () => {
	it("returns the same color for the same user id", () => {
		expect(assignMultiplayerColor("user-1")).toBe(
			assignMultiplayerColor("user-1"),
		);
	});

	it("returns a known palette color", () => {
		expect(MULTIPLAYER_COLORS.has(assignMultiplayerColor("someone"))).toBe(
			true,
		);
	});

	it("handles empty user ids", () => {
		expect(MULTIPLAYER_COLORS.has(assignMultiplayerColor(""))).toBe(true);
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
