const MULTIPLAYER_COLORS = [
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
] as const;

export function assignMultiplayerColor(userId: string): string {
	let hash = 0;

	for (let index = 0; index < userId.length; index += 1) {
		hash = ((hash << 5) - hash + userId.charCodeAt(index)) | 0;
	}

	return MULTIPLAYER_COLORS[Math.abs(hash) % MULTIPLAYER_COLORS.length];
}

const HEX_COLOR_PATTERN =
	/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FUNCTION_COLOR_PATTERN = /^(?:rgb|rgba|hsl|hsla)\([^;{}]+\)$/;
const CSS_VARIABLE_COLOR_PATTERN = /^var\(--[A-Za-z0-9_-]+\)$/;
const NAMED_COLOR_PATTERN = /^[A-Za-z]+$/;
const CSS_COLOR_KEYWORDS = new Set([
	"transparent",
	"currentColor",
	"inherit",
	"initial",
	"unset",
	"revert",
	"revert-layer",
]);

export function normalizeMultiplayerColor(
	color: string | undefined,
	fallbackColor: string,
): string {
	const trimmedColor = color?.trim();
	if (!trimmedColor) {
		return fallbackColor;
	}

	if (
		HEX_COLOR_PATTERN.test(trimmedColor) ||
		FUNCTION_COLOR_PATTERN.test(trimmedColor) ||
		CSS_VARIABLE_COLOR_PATTERN.test(trimmedColor) ||
		NAMED_COLOR_PATTERN.test(trimmedColor) ||
		CSS_COLOR_KEYWORDS.has(trimmedColor)
	) {
		return trimmedColor;
	}

	return fallbackColor;
}
