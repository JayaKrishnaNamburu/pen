import {
	MARKDOWN_FAST_APPLY_OMISSION_MARKER,
	MARKDOWN_FAST_APPLY_ROOT_TAG,
} from "./flowMarkdown";

export interface MarkdownFastApplyContract {
	instructions: string;
	anchorBefore: string;
	anchorAfter: string;
	patch: string;
}

export interface MarkdownFastApplyInput {
	originalMarkdown: string;
	contract: MarkdownFastApplyContract;
}

export interface MarkdownFastApplyResult {
	success: boolean;
	mergedMarkdown?: string;
	confidence: number;
	diff?: string;
	issues: string[];
	fallbackReason?: string;
}

export function parseMarkdownFastApplyContract(
	value: string,
): MarkdownFastApplyContract | null {
	const normalized = normalizeMarkdownFastApplyValue(value);
	if (
		!normalized.startsWith(`<${MARKDOWN_FAST_APPLY_ROOT_TAG}>`) ||
		!normalized.endsWith(`</${MARKDOWN_FAST_APPLY_ROOT_TAG}>`)
	) {
		return null;
	}

	const instructions = readTagContent(normalized, "instructions");
	const anchorBefore = readTagContent(normalized, "anchorBefore") ?? "";
	const anchorAfter = readTagContent(normalized, "anchorAfter") ?? "";
	const patch = readTagContent(normalized, "patch");
	if (!instructions || !patch) {
		return null;
	}

	return {
		instructions: instructions.trim(),
		anchorBefore,
		anchorAfter,
		patch,
	};
}

export function applyMarkdownFastApply(
	input: MarkdownFastApplyInput,
): MarkdownFastApplyResult {
	const originalMarkdown = normalizeMarkdownFastApplyValue(input.originalMarkdown);
	const replacementMarkdown = stripPatchMarkers(input.contract.patch);
	if (
		replacementMarkdown.length === 0 &&
		input.contract.anchorBefore.length === 0 &&
		input.contract.anchorAfter.length === 0 &&
		originalMarkdown.length > 0
	) {
		return {
			success: false,
			confidence: 0,
			issues: ["Fast apply patch does not describe a scoped edit."],
			fallbackReason: "missing-anchors",
		};
	}

	if (originalMarkdown.length === 0) {
		const createdMarkdown = replacementMarkdown.trim();
		return {
			success: true,
			mergedMarkdown: createdMarkdown,
			confidence: 0.98,
			diff: buildMarkdownFastApplyDiff("", createdMarkdown),
			issues: [],
		};
	}

	const beforeResolution = resolveUniqueAnchor(
		originalMarkdown,
		input.contract.anchorBefore,
		0,
	);
	if (!beforeResolution.ok) {
		return {
			success: false,
			confidence: 0,
			issues: [beforeResolution.issue],
			fallbackReason: "anchor-before",
		};
	}

	const replaceStart =
		beforeResolution.index + (input.contract.anchorBefore?.length ?? 0);
	const afterResolution = resolveUniqueAnchor(
		originalMarkdown,
		input.contract.anchorAfter,
		replaceStart,
	);
	if (!afterResolution.ok) {
		return {
			success: false,
			confidence: 0,
			issues: [afterResolution.issue],
			fallbackReason: "anchor-after",
		};
	}

	const replaceEnd = afterResolution.index;
	if (replaceEnd < replaceStart) {
		return {
			success: false,
			confidence: 0,
			issues: ["Fast apply anchors resolve to an invalid replacement window."],
			fallbackReason: "invalid-window",
		};
	}

	const mergedMarkdown =
		originalMarkdown.slice(0, replaceStart) +
		replacementMarkdown +
		originalMarkdown.slice(replaceEnd);
	const confidence = calculateFastApplyConfidence(
		input.contract,
		beforeResolution.usedAnchor,
		afterResolution.usedAnchor,
	);

	return {
		success: true,
		mergedMarkdown,
		confidence,
		diff: buildMarkdownFastApplyDiff(
			originalMarkdown.slice(replaceStart, replaceEnd),
			replacementMarkdown,
		),
		issues: [],
	};
}

export function stripPatchMarkers(value: string): string {
	const normalized = normalizeMarkdownFastApplyValue(value).trim();
	const withoutLeadingMarker = normalized.startsWith(
		MARKDOWN_FAST_APPLY_OMISSION_MARKER,
	)
		? normalized.slice(MARKDOWN_FAST_APPLY_OMISSION_MARKER.length)
		: normalized;
	const withoutEdgeMarkers = withoutLeadingMarker.endsWith(
		MARKDOWN_FAST_APPLY_OMISSION_MARKER,
	)
		? withoutLeadingMarker
			.slice(0, -MARKDOWN_FAST_APPLY_OMISSION_MARKER.length)
		: withoutLeadingMarker;
	return withoutEdgeMarkers;
}

function normalizeMarkdownFastApplyValue(value: string): string {
	return value.replace(/\r\n?/g, "\n").trim();
}

function readTagContent(source: string, tagName: string): string | null {
	const match = source.match(
		new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i"),
	);
	if (!match?.[1]) {
		return null;
	}

	const content = match[1];
	const trimmedContent = content.trim();
	const cdataMatch = trimmedContent.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
	return cdataMatch?.[1] ?? trimmedContent;
}

function resolveUniqueAnchor(
	source: string,
	anchor: string,
	searchFrom: number,
): {
	ok: boolean;
	index: number;
	usedAnchor: boolean;
	issue: string;
} {
	if (anchor.length === 0) {
		return {
			ok: true,
			index: searchFrom === 0 ? 0 : source.length,
			usedAnchor: false,
			issue: "",
		};
	}

	const firstIndex = source.indexOf(anchor, searchFrom);
	if (firstIndex === -1) {
		return {
			ok: false,
			index: -1,
			usedAnchor: true,
			issue: "Fast apply anchor could not be found in the scoped markdown.",
		};
	}

	const duplicateIndex = source.indexOf(anchor, firstIndex + 1);
	if (duplicateIndex !== -1) {
		return {
			ok: false,
			index: -1,
			usedAnchor: true,
			issue: "Fast apply anchor is ambiguous in the scoped markdown.",
		};
	}

	return {
		ok: true,
		index: firstIndex,
		usedAnchor: true,
		issue: "",
	};
}

function calculateFastApplyConfidence(
	contract: MarkdownFastApplyContract,
	usedBeforeAnchor: boolean,
	usedAfterAnchor: boolean,
): number {
	if (usedBeforeAnchor && usedAfterAnchor) {
		return 0.96;
	}
	if (usedBeforeAnchor || usedAfterAnchor) {
		return 0.88;
	}
	return contract.patch.trim().length > 0 ? 0.72 : 0.4;
}

function buildMarkdownFastApplyDiff(before: string, after: string): string {
	return [
		"--- before",
		"+++ after",
		"@@",
		...before.split("\n").map((line) => `-${line}`),
		...after.split("\n").map((line) => `+${line}`),
	].join("\n");
}
