export interface InlineInputRuleMatch {
	deleteRange: { start: number; end: number };
	text: string;
	marks: Record<string, true>;
}

const INLINE_RULES = [
	{
		trigger: "*",
		pattern: /\*\*(.+?)\*\*$/,
		markType: "bold",
	},
	{
		trigger: "*",
		pattern: /(?<!\*)\*([^*]+?)\*$/,
		markType: "italic",
	},
	{
		trigger: "`",
		pattern: /`([^`]+?)`$/,
		markType: "code",
	},
	{
		trigger: "~",
		pattern: /~~(.+?)~~$/,
		markType: "strikethrough",
	},
	{
		trigger: "=",
		pattern: /==(.+?)==$/,
		markType: "highlight",
	},
] as const;

export function matchInlineInputRule(
	blockText: string,
	offset: number,
	insertedText: string,
): InlineInputRuleMatch | null {
	if (insertedText.length !== 1) {
		return null;
	}

	const textWithInsert =
		blockText.slice(0, offset) + insertedText + blockText.slice(offset);
	const cursorAfterInsert = offset + insertedText.length;

	for (const rule of INLINE_RULES) {
		if (insertedText !== rule.trigger.slice(-1)) {
			continue;
		}

		const match = rule.pattern.exec(textWithInsert);
		if (!match) {
			continue;
		}

		const matchEnd = match.index + match[0].length;
		if (matchEnd !== cursorAfterInsert) {
			continue;
		}

		const innerText = match[1];
		if (!innerText) {
			continue;
		}

		return {
			deleteRange: {
				start: match.index,
				end: match.index + match[0].length,
			},
			text: innerText,
			marks: { [rule.markType]: true },
		};
	}

	return null;
}
