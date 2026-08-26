/**
 * Display text for a markdown payload that is still arriving.
 *
 * `insert_blocks` and `replace_blocks` carry markdown (EC3), but the preview
 * is inline text inside one block: it cannot become a heading and a list while
 * the call is open, so showing the payload verbatim puts `##` and `-` on
 * screen and then swaps them for real blocks when the turn lands. Stripping the
 * syntax keeps the preview honest about the words, which is the part that is
 * actually final, and quiet about the structure, which is not.
 *
 * Every rule is line-local and closing-marker-free so a half-arrived fragment
 * formats the same way its completed form starts. A rule that needed to see the
 * end of a construct would reformat text already on screen.
 */
export function toStreamingPreviewText(markdown: string): string {
	const lines = markdown.split("\n");
	const formatted: string[] = [];
	for (const line of lines) {
		if (isCodeFence(line) || isTableSeparator(line)) {
			continue;
		}
		formatted.push(stripInlineMarkers(stripLineMarker(line)));
	}
	// Markdown separates blocks with a blank line; the preview separates them
	// with a line, because a blank line inside one block reads as a hole.
	return formatted.join("\n").replace(/\n{2,}/g, "\n");
}

function stripLineMarker(line: string): string {
	const withoutIndent = line.replace(/^[ \t]+/, "");
	if (isTableRow(withoutIndent)) {
		return withoutIndent
			.replace(/^\|/, "")
			.replace(/\|$/, "")
			.split("|")
			.map((cell) => cell.trim())
			.filter((cell) => cell.length > 0)
			.join("  ");
	}
	return withoutIndent
		.replace(/^#{1,6}[ \t]*/, "")
		.replace(/^>[ \t]?/, "")
		.replace(/^[-*+](?:[ \t]+|$)/, "")
		.replace(/^\[[ x]\][ \t]+/i, "")
		.replace(/^\d+[.)](?:[ \t]+|$)/, "")
		.replace(/^([-*_])\1{2,}$/, "");
}

function stripInlineMarkers(text: string): string {
	return text
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\*\*|~~|__|`/g, "")
		.replace(/\*/g, "");
}

function isCodeFence(line: string): boolean {
	return /^[ \t]*(```|~~~)/.test(line);
}

function isTableRow(line: string): boolean {
	return line.startsWith("|");
}

function isTableSeparator(line: string): boolean {
	return /^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/.test(
		line,
	);
}
