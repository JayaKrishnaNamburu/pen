const OMITTED_MARKDOWN_MARKER = "<!-- ... existing markdown ... -->";

export function parseBenchMarkdownFastApplyContract(
	value: string,
): {
	anchorBefore: string;
	anchorAfter: string;
	patch: string;
} | null {
	const normalized = value.replace(/\r\n?/g, "\n").trim();
	const anchorBefore = readTagContent(normalized, "anchorBefore");
	const anchorAfter = readTagContent(normalized, "anchorAfter");
	const patch = readTagContent(normalized, "patch");
	if (anchorBefore == null || anchorAfter == null || patch == null) {
		return null;
	}
	return {
		anchorBefore: anchorBefore.trim(),
		anchorAfter: anchorAfter.trim(),
		patch,
	};
}

export function applyBenchMarkdownFastApply(input: {
	originalMarkdown: string;
	contract: {
		anchorBefore: string;
		anchorAfter: string;
		patch: string;
	};
}): string {
	const originalMarkdown = input.originalMarkdown.replace(/\r\n?/g, "\n").trim();
	const replacementMarkdown = stripPatchMarkers(input.contract.patch);
	if (originalMarkdown.length === 0) {
		return replacementMarkdown.trim();
	}

	const beforeIndex = input.contract.anchorBefore.length
		? originalMarkdown.indexOf(input.contract.anchorBefore)
		: 0;
	const afterIndex = input.contract.anchorAfter.length
		? originalMarkdown.indexOf(
			input.contract.anchorAfter,
			beforeIndex + input.contract.anchorBefore.length,
		)
		: originalMarkdown.length;
	if (beforeIndex === -1 || afterIndex === -1) {
		return originalMarkdown;
	}

	return (
		originalMarkdown.slice(0, beforeIndex + input.contract.anchorBefore.length) +
		replacementMarkdown +
		originalMarkdown.slice(afterIndex)
	);
}

function stripPatchMarkers(value: string): string {
	const normalized = value.replace(/\r\n?/g, "\n").trim();
	const withoutLeadingMarker = normalized.startsWith(OMITTED_MARKDOWN_MARKER)
		? normalized.slice(OMITTED_MARKDOWN_MARKER.length)
		: normalized;
	const withoutTrailingMarker = withoutLeadingMarker.endsWith(
		OMITTED_MARKDOWN_MARKER,
	)
		? withoutLeadingMarker
			.slice(0, -OMITTED_MARKDOWN_MARKER.length)
			.replace(/\n+$/, "")
		: withoutLeadingMarker;
	return withoutTrailingMarker;
}

function readTagContent(source: string, tagName: string): string | null {
	const match = source.match(
		new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i"),
	);
	if (!match?.[1]) {
		return null;
	}
	const trimmedContent = match[1].trim();
	const cdataMatch = trimmedContent.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
	return cdataMatch?.[1] ?? trimmedContent;
}
