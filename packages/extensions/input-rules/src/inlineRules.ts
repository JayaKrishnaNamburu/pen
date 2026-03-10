import type { InlineInputRule } from "./types";

/**
 * Inline markdown shortcuts that fire when the user types the closing delimiter.
 *
 * Each pattern captures the inner text as group 1 and must match ending
 * exactly at the cursor position. The engine deletes the full match
 * (including delimiters) and re-inserts the inner text with the mark applied.
 *
 * Patterns use negative lookbehind/lookahead where needed to avoid
 * false positives (e.g. `**` inside a word).
 */
export const defaultInlineRules: InlineInputRule[] = [
	{
		id: "inline-rule:bold",
		trigger: "*",
		pattern: /\*\*(.+?)\*\*$/,
		markType: "bold",
	},
	{
		id: "inline-rule:italic",
		trigger: "*",
		// Single * that isn't preceded by another * (to avoid eating bold patterns).
		// Matches *text* at end of text-before-cursor.
		pattern: /(?<!\*)\*([^*]+?)\*$/,
		markType: "italic",
	},
	{
		id: "inline-rule:code",
		trigger: "`",
		pattern: /`([^`]+?)`$/,
		markType: "code",
	},
	{
		id: "inline-rule:strikethrough",
		trigger: "~",
		pattern: /~~(.+?)~~$/,
		markType: "strikethrough",
	},
	{
		id: "inline-rule:highlight",
		trigger: "=",
		pattern: /==(.+?)==$/,
		markType: "highlight",
	},
];
