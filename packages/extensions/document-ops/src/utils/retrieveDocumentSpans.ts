import type { Editor } from "@pen/types";
import {
	buildDocumentBlockSnapshots,
	formatBlocksAsMarkdown,
	type DocumentBlockSnapshot,
	type DocumentContextViewMode,
} from "./documentContext";

export interface RetrievedDocumentSpan {
	id: string;
	blockIds: string[];
	range: {
		startBlockId: string;
		endBlockId: string;
	};
	blockTypes: string[];
	headingPath: string[];
	preview: string;
	markdown: string;
	score: number;
	rationale: string;
	neighbors: {
		beforeBlockId: string | null;
		afterBlockId: string | null;
	};
}

export interface RetrieveDocumentSpansInput {
	query: string;
	maxResults?: number;
	viewMode?: DocumentContextViewMode;
	activeBlockId?: string | null;
	targetBlockId?: string | null;
}

const DEFAULT_MAX_RESULTS = 5;
const FULL_QUERY_SCORE = 8;
const TOKEN_MATCH_SCORE = 2;
const BLOCK_TYPE_MATCH_SCORE = 3;
const HEADING_PATH_MATCH_SCORE = 1.5;
const ACTIVE_BLOCK_EXACT_SCORE = 4;
const ACTIVE_BLOCK_NEIGHBOR_SCORE = 1.5;
const TARGET_BLOCK_EXACT_SCORE = 5;
const TARGET_BLOCK_NEIGHBOR_SCORE = 2;
const PREVIEW_LIMIT = 160;
const MAX_BLOCKS_PER_SPAN = 3;

export function retrieveDocumentSpans(
	editor: Editor,
	input: RetrieveDocumentSpansInput,
): RetrievedDocumentSpan[] {
	const normalizedQuery = input.query.trim().toLowerCase();
	if (normalizedQuery.length === 0) {
		return [];
	}

	const snapshots = buildDocumentBlockSnapshots(
		editor,
		input.viewMode ?? "resolved",
	);
	const tokens = tokenizeQuery(normalizedQuery);
	const ranked = snapshots
		.map((snapshot, index) =>
			scoreSnapshot(snapshot, snapshots, index, {
				normalizedQuery,
				tokens,
				activeBlockId: input.activeBlockId ?? null,
				targetBlockId: input.targetBlockId ?? null,
			}),
		)
		.filter((result) => result.score > 0)
		.sort((left, right) => right.score - left.score || left.index - right.index)
		.slice(0, input.maxResults ?? DEFAULT_MAX_RESULTS);

	const spans: RetrievedDocumentSpan[] = [];
	const seenRanges = new Set<string>();

	for (const rankedSnapshot of ranked) {
		const span = createRetrievedSpan(snapshots, rankedSnapshot);
		const spanKey = `${span.range.startBlockId}:${span.range.endBlockId}`;
		if (seenRanges.has(spanKey)) {
			continue;
		}
		seenRanges.add(spanKey);
		spans.push(span);
	}

	return spans;
}

function scoreSnapshot(
	snapshot: DocumentBlockSnapshot,
	snapshots: DocumentBlockSnapshot[],
	index: number,
	input: {
		normalizedQuery: string;
		tokens: string[];
		activeBlockId: string | null;
		targetBlockId: string | null;
	},
): {
		snapshot: DocumentBlockSnapshot;
		index: number;
		score: number;
		rationale: string;
	} {
	const searchableText = [
		snapshot.content,
		snapshot.markdown,
		snapshot.type,
		snapshot.headingPath.join(" "),
	]
		.join("\n")
		.toLowerCase();
	let score = 0;
	const rationale: string[] = [];

	if (searchableText.includes(input.normalizedQuery)) {
		score += FULL_QUERY_SCORE;
		rationale.push("full-query-match");
	}

	let tokenMatches = 0;
	for (const token of input.tokens) {
		if (searchableText.includes(token)) {
			score += TOKEN_MATCH_SCORE;
			tokenMatches += 1;
		}
		if (snapshot.type.toLowerCase().includes(token)) {
			score += BLOCK_TYPE_MATCH_SCORE;
			rationale.push(`type:${token}`);
		}
		if (snapshot.headingPath.some((heading) => heading.toLowerCase().includes(token))) {
			score += HEADING_PATH_MATCH_SCORE;
			rationale.push(`heading:${token}`);
		}
	}
	if (tokenMatches > 0) {
		rationale.push(`token-matches:${tokenMatches}`);
	}

	if (snapshot.id === input.targetBlockId) {
		score += TARGET_BLOCK_EXACT_SCORE;
		rationale.push("target-block");
	} else if (isNeighborSnapshot(snapshots, index, input.targetBlockId)) {
		score += TARGET_BLOCK_NEIGHBOR_SCORE;
		rationale.push("target-neighbor");
	}

	if (snapshot.id === input.activeBlockId) {
		score += ACTIVE_BLOCK_EXACT_SCORE;
		rationale.push("active-block");
	} else if (isNeighborSnapshot(snapshots, index, input.activeBlockId)) {
		score += ACTIVE_BLOCK_NEIGHBOR_SCORE;
		rationale.push("active-neighbor");
	}

	return {
		snapshot,
		index,
		score,
		rationale: rationale.join(", ") || "lexical-match",
	};
}

function isNeighborSnapshot(
	snapshots: DocumentBlockSnapshot[],
	index: number,
	blockId: string | null,
): boolean {
	if (!blockId) {
		return false;
	}
	return snapshots[index - 1]?.id === blockId || snapshots[index + 1]?.id === blockId;
}

function tokenizeQuery(query: string): string[] {
	return [...new Set(query.split(/[^a-z0-9]+/i).filter((token) => token.length > 1))];
}

function createRetrievedSpan(
	snapshots: DocumentBlockSnapshot[],
	input: {
		snapshot: DocumentBlockSnapshot;
		index: number;
		score: number;
		rationale: string;
	},
): RetrievedDocumentSpan {
	const { snapshot, index, score, rationale } = input;
	let startIndex = Math.max(0, index - 1);
	let endIndex = Math.min(snapshots.length - 1, index + 1);

	while (endIndex - startIndex + 1 < MAX_BLOCKS_PER_SPAN) {
		if (startIndex > 0) {
			startIndex -= 1;
			continue;
		}
		if (endIndex < snapshots.length - 1) {
			endIndex += 1;
			continue;
		}
		break;
	}

	const spanSnapshots = snapshots.slice(startIndex, endIndex + 1);
	const firstSnapshot = spanSnapshots[0]!;
	const lastSnapshot = spanSnapshots[spanSnapshots.length - 1]!;
	const previewSource = spanSnapshots
		.map((spanSnapshot) => spanSnapshot.content || spanSnapshot.markdown || spanSnapshot.type)
		.join("\n");

	return {
		id: `span:${snapshot.id}`,
		blockIds: spanSnapshots.map((spanSnapshot) => spanSnapshot.id),
		range: {
			startBlockId: firstSnapshot.id,
			endBlockId: lastSnapshot.id,
		},
		blockTypes: spanSnapshots.map((spanSnapshot) => spanSnapshot.type),
		headingPath: snapshot.headingPath,
		preview: truncatePreview(previewSource),
		markdown: formatBlocksAsMarkdown(spanSnapshots),
		score: Number(score.toFixed(2)),
		rationale,
		neighbors: {
			beforeBlockId: snapshots[startIndex - 1]?.id ?? null,
			afterBlockId: snapshots[endIndex + 1]?.id ?? null,
		},
	};
}

function truncatePreview(value: string): string {
	const normalized = value.trim();
	if (normalized.length <= PREVIEW_LIMIT) {
		return normalized;
	}
	return `${normalized.slice(0, PREVIEW_LIMIT - 1).trimEnd()}…`;
}
