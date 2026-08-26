import type { PersistentSuggestion, StructuralReviewItem } from "@input/pen-ai";
import { useAIActions, useGeneration, useSuggestions } from "@input/pen-react";
import type { Editor } from "@input/pen-types";
import type { MouseEvent, ReactNode } from "react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ScrollArea } from "../ui/ScrollArea";

interface ReviewSurfaceProps {
	editor: Editor;
	children: ReactNode;
}

const ACTION_LABELS = {
	insert: "Insert",
	delete: "Delete",
	"insert-block": "Insert",
	"delete-block": "Delete",
	"move-block": "Move",
	"convert-block": "Convert",
	"split-block": "Split",
	"format-text": "Format",
} as const satisfies Record<PersistentSuggestion["action"], string>;

const REVIEW_KIND_LABELS = {
	added: "Add",
	removed: "Remove",
	updated: "Update",
	moved: "Move",
} as const satisfies Record<StructuralReviewItem["changeKind"], string>;

/**
 * Hosts the document review bar.
 *
 * Accept and reject stay on the AI controller — this is presentation, not a
 * second suggestion store. The bar is the only review surface: one list in
 * document order, no floating controls competing for geometry.
 */
export function ReviewSurface({ editor, children }: ReviewSurfaceProps) {
	const suggestions = useSuggestions(editor);
	const generation = useGeneration(editor);
	const aiActions = useAIActions(editor);

	const reviewItems = generation?.reviewItems ?? [];
	const reviewActionsEnabled =
		generation?.status !== "streaming" &&
		generation?.planState === "validated";
	const pendingCount = suggestions.length + reviewItems.length;
	const orderedSuggestions = sortSuggestionsByDocumentOrder(
		editor,
		suggestions,
	);

	function acceptAll() {
		aiActions.acceptAllSuggestions();
		if (reviewItems.length > 0 && reviewActionsEnabled) {
			aiActions.acceptReviewItems(reviewItems.map((item) => item.id));
		}
	}

	function rejectAll() {
		aiActions.rejectAllSuggestions();
		if (reviewItems.length > 0 && reviewActionsEnabled) {
			aiActions.rejectReviewItems(reviewItems.map((item) => item.id));
		}
	}

	const suggestionRows = orderedSuggestions.map((suggestion) => (
		<ReviewChangeRow
			key={suggestion.id}
			badge={ACTION_LABELS[suggestion.action]}
			badgeColor={
				suggestion.action === "delete" ||
				suggestion.action === "delete-block"
					? "var(--palette-b40)"
					: "var(--palette-purple)"
			}
			where={blockWhereLabel(
				editor,
				suggestion.blockId,
				suggestion.kind === "text" ? suggestion.cell : undefined,
			)}
			summary={suggestionPreview(editor, suggestion)}
			onAccept={() => {
				aiActions.acceptSuggestion(suggestion.id);
			}}
			onReject={() => {
				aiActions.rejectSuggestion(suggestion.id);
			}}
		/>
	));

	const reviewRows = reviewItems.map((item) => (
		<ReviewChangeRow
			key={item.id}
			badge={REVIEW_KIND_LABELS[item.changeKind]}
			badgeColor={
				item.changeKind === "removed"
					? "var(--palette-b40)"
					: "var(--palette-purple)"
			}
			where={item.groupLabel}
			summary={item.summary || item.label}
			acceptEnabled={reviewActionsEnabled}
			rejectEnabled={reviewActionsEnabled}
			onAccept={() => {
				aiActions.acceptReviewItem(item.id);
			}}
			onReject={() => {
				aiActions.rejectReviewItem(item.id);
			}}
		/>
	));

	const reviewBar =
		pendingCount > 0 ? (
			<div className="review-bar">
				<div className="review-bar-copy">
					{pendingCount === 1
						? "1 proposed change"
						: `${pendingCount} proposed changes`}
				</div>
				<div className="review-bar-actions">
					<Button kind="faded" size="sm" onClick={rejectAll}>
						Reject all
					</Button>
					<Button kind="primary" size="sm" onClick={acceptAll}>
						Accept all
					</Button>
				</div>
				<div className="review-change-list">
					<ScrollArea>
						{suggestionRows}
						{reviewRows}
					</ScrollArea>
				</div>
			</div>
		) : null;

	return (
		<div className="review-surface">
			{children}
			{reviewBar}
		</div>
	);
}

interface ReviewChangeRowProps {
	badge: string;
	badgeColor: string;
	where: string;
	summary: string;
	acceptEnabled?: boolean;
	rejectEnabled?: boolean;
	onAccept: () => void;
	onReject: () => void;
}

function ReviewChangeRow({
	badge,
	badgeColor,
	where,
	summary,
	acceptEnabled = true,
	rejectEnabled = true,
	onAccept,
	onReject,
}: ReviewChangeRowProps) {
	return (
		<div className="review-change-row">
			<Badge color={badgeColor}>{badge}</Badge>
			<div className="review-change-copy">
				<div className="review-change-where">{where}</div>
				<div className="review-change-summary">{summary}</div>
			</div>
			<div className="review-change-actions">
				<Button
					kind="faded"
					size="sm"
					disabled={!rejectEnabled}
					onMouseDown={preventEditorBlur}
					onClick={onReject}
				>
					Reject
				</Button>
				<Button
					kind="primary"
					size="sm"
					disabled={!acceptEnabled}
					onMouseDown={preventEditorBlur}
					onClick={onAccept}
				>
					Accept
				</Button>
			</div>
		</div>
	);
}

function preventEditorBlur(event: MouseEvent) {
	event.preventDefault();
}

function sortSuggestionsByDocumentOrder(
	editor: Editor,
	suggestions: readonly PersistentSuggestion[],
): PersistentSuggestion[] {
	const order = new Map(
		editor.documentState.blockOrder.map((blockId, index) => [
			blockId,
			index,
		]),
	);

	return [...suggestions].sort((left, right) => {
		const leftIndex = order.get(left.blockId) ?? Number.MAX_SAFE_INTEGER;
		const rightIndex = order.get(right.blockId) ?? Number.MAX_SAFE_INTEGER;
		if (leftIndex !== rightIndex) {
			return leftIndex - rightIndex;
		}
		const leftCell = left.kind === "text" ? left.cell : undefined;
		const rightCell = right.kind === "text" ? right.cell : undefined;
		if (leftCell && rightCell) {
			if (leftCell.row !== rightCell.row) {
				return leftCell.row - rightCell.row;
			}
			if (leftCell.col !== rightCell.col) {
				return leftCell.col - rightCell.col;
			}
		} else if (leftCell) {
			return 1;
		} else if (rightCell) {
			return -1;
		}
		const leftOffset = left.kind === "text" ? left.offset : 0;
		const rightOffset = right.kind === "text" ? right.offset : 0;
		return leftOffset - rightOffset;
	});
}

function blockWhereLabel(
	editor: Editor,
	blockId: string,
	cell?: { row: number; col: number },
): string {
	const block = editor.getBlock(blockId);
	if (!block) {
		return "Unknown block";
	}
	if (cell) {
		const cellText = block
			.as("table")
			?.tableCell(cell.row, cell.col)
			?.textContent()
			.trim();
		const coord = `r${cell.row + 1}c${cell.col + 1}`;
		return cellText
			? `table · ${coord} · ${truncate(cellText)}`
			: `table · ${coord}`;
	}
	const preview = truncate(block.textContent().trim());
	return preview ? `${block.type} · ${preview}` : block.type;
}

function suggestionPreview(
	editor: Editor,
	suggestion: PersistentSuggestion,
): string {
	const block = editor.getBlock(suggestion.blockId);
	if (suggestion.kind === "text") {
		const source = suggestion.cell
			? (block
					?.as("table")
					?.tableCell(suggestion.cell.row, suggestion.cell.col)
					?.textContent() ?? "")
			: (block?.textContent() ?? "");
		const text = source
			.slice(suggestion.offset, suggestion.offset + suggestion.length)
			.trim();
		if (text) {
			return truncate(text);
		}
		return suggestion.action === "delete"
			? "Deleted text"
			: "Inserted text";
	}

	switch (suggestion.action) {
		case "insert-block":
			return `Insert ${block?.type ?? "block"}`;
		case "delete-block":
			return `Delete ${block?.type ?? "block"}`;
		case "move-block":
			return `Move ${block?.type ?? "block"}`;
		// A pending attribute change leaves the block as it was, so the block
		// itself only tells you the half that is not changing. The proposal
		// rides on the suggestion.
		case "convert-block": {
			const proposed = suggestion.previousState?.type;
			const current = block?.type ?? "block";
			return proposed
				? `Convert ${current} to ${proposed}`
				: `Convert ${current}`;
		}
		case "split-block":
			return `Split ${block?.type ?? "block"}`;
		case "format-text": {
			const marks = Object.keys(
				suggestion.previousState?.format?.marks ?? {},
			);
			return marks.length > 0
				? `Format ${marks.join(", ")}`
				: `Format ${block?.type ?? "block"}`;
		}
	}
}

function truncate(value: string, maxLength = 56): string {
	if (value.length <= maxLength) {
		return value;
	}
	return `${value.slice(0, maxLength)}…`;
}
