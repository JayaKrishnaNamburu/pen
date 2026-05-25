import React from "react";
import type { StructuralReviewComparisonRow, StructuralReviewItem } from "@pen/ai";

const REVIEW_COMPARISON_SECTION_LABELS = {
	schema: "Schema changes",
	view: "View changes",
} as const;

const REVIEW_ITEM_SECTION_LABELS = {
	content: "Content changes",
	block: "Block changes",
	row: "Row changes",
	cell: "Cell changes",
	schema: "Schema changes",
	view: "View changes",
} as const;

const REVIEW_ITEM_KIND_LABELS = {
	added: "Added",
	removed: "Removed",
	updated: "Updated",
	moved: "Moved",
} as const;

const REVIEW_ITEM_KIND_NOUNS = {
	added: "additions",
	removed: "removals",
	updated: "updates",
	moved: "moves",
} as const;

const REVIEW_ITEM_SECTION_ORDER: StructuralReviewItem["section"][] = [
	"content",
	"block",
	"row",
	"cell",
	"schema",
	"view",
];

const REVIEW_ITEM_KIND_ORDER: StructuralReviewItem["changeKind"][] = [
	"added",
	"removed",
	"updated",
	"moved",
];

const REVIEW_COMPARISON_KIND_LABELS = {
	added: "Added",
	removed: "Removed",
	updated: "Updated",
} as const;

export interface ReviewFocusTarget {
	id: string;
	type: "group" | "subgroup" | "item";
	parentId?: string;
	toggle?: () => void;
	expand?: () => void;
	collapse?: () => void;
	accept?: () => void;
	reject?: () => void;
}

export function preventEditorBlur(event: React.MouseEvent<HTMLButtonElement>) {
	event.preventDefault();
}

export function groupStructuralReviewItems(
	items: readonly StructuralReviewItem[],
): Array<{
	id: string;
	label: string;
	items: StructuralReviewItem[];
}> {
	const groups = new Map<
		string,
		{
			id: string;
			label: string;
			items: StructuralReviewItem[];
		}
	>();

	for (const item of items) {
		const group = groups.get(item.groupId);
		if (group) {
			group.items.push(item);
			continue;
		}
		groups.set(item.groupId, {
			id: item.groupId,
			label: item.groupLabel,
			items: [item],
		});
	}

	return [...groups.values()];
}

export function groupReviewComparisonRows(
	rows: readonly StructuralReviewComparisonRow[],
): Array<{
	id: StructuralReviewComparisonRow["section"];
	label: string;
	rows: StructuralReviewComparisonRow[];
}> {
	const sections = new Map<
		StructuralReviewComparisonRow["section"],
		{
			id: StructuralReviewComparisonRow["section"];
			label: string;
			rows: StructuralReviewComparisonRow[];
		}
	>();

	for (const row of rows) {
		const section = sections.get(row.section);
		if (section) {
			section.rows.push(row);
			continue;
		}
		sections.set(row.section, {
			id: row.section,
			label: REVIEW_COMPARISON_SECTION_LABELS[row.section],
			rows: [row],
		});
	}

	return [...sections.values()];
}

export function summarizeStructuralReviewGroup(items: readonly StructuralReviewItem[]): {
	kindRollups: Array<{
		id: StructuralReviewItem["changeKind"];
		label: string;
		count: number;
	}>;
	sectionRollups: Array<{
		id: StructuralReviewItem["section"];
		label: string;
		count: number;
	}>;
} {
	const kindCounts = new Map<StructuralReviewItem["changeKind"], number>();
	const sectionCounts = new Map<StructuralReviewItem["section"], number>();

	for (const item of items) {
		kindCounts.set(item.changeKind, (kindCounts.get(item.changeKind) ?? 0) + 1);
		sectionCounts.set(item.section, (sectionCounts.get(item.section) ?? 0) + 1);
	}

	const kindRollups = REVIEW_ITEM_KIND_ORDER.flatMap((kind) => {
		const count = kindCounts.get(kind);
		return count == null
			? []
			: [{ id: kind, label: formatReviewItemKindLabel(kind), count }];
	});
	const sectionRollups = REVIEW_ITEM_SECTION_ORDER.flatMap((section) => {
		const count = sectionCounts.get(section);
		return count == null
			? []
			: [{ id: section, label: formatReviewItemSectionLabel(section), count }];
	});

	return { kindRollups, sectionRollups };
}

export function groupStructuralReviewSubgroups(
	items: readonly StructuralReviewItem[],
): Array<{
	id: string;
	label: string;
	items: StructuralReviewItem[];
}> {
	const subgroups = new Map<
		string,
		{
			id: string;
			label: string;
			items: StructuralReviewItem[];
		}
	>();

	for (const item of items) {
		const id = `${item.section}:${item.changeKind}`;
		const subgroup = subgroups.get(id);
		if (subgroup) {
			subgroup.items.push(item);
			continue;
		}
		subgroups.set(id, {
			id,
			label: formatReviewSubgroupLabel(item.section, item.changeKind),
			items: [item],
		});
	}

	const orderedSubgroups = REVIEW_ITEM_SECTION_ORDER.flatMap((section) =>
		REVIEW_ITEM_KIND_ORDER.flatMap((kind) => {
			const subgroup = subgroups.get(`${section}:${kind}`);
			return subgroup ? [subgroup] : [];
		}),
	);
	return orderedSubgroups;
}

export function createReviewSubgroupKey(groupId: string, subgroupId: string): string {
	return `${groupId}:${subgroupId}`;
}

export function createReviewGroupFocusTargetId(groupId: string): string {
	return `group:${groupId}`;
}

export function createReviewSubgroupFocusTargetId(
	groupId: string,
	subgroupId: string,
): string {
	return `subgroup:${groupId}:${subgroupId}`;
}

export function createReviewItemFocusTargetId(itemId: string): string {
	return `item:${itemId}`;
}

export function clampReviewFocusIndex(index: number, maxIndex: number): number {
	if (maxIndex < 0) {
		return 0;
	}
	if (index < 0) {
		return 0;
	}
	if (index > maxIndex) {
		return maxIndex;
	}
	return index;
}

export function resolveReviewFocusTarget(
	targets: readonly ReviewFocusTarget[],
	targetId: string | null,
): ReviewFocusTarget | null {
	if (!targetId) {
		return null;
	}
	return targets.find((target) => target.id === targetId) ?? null;
}

export function resolveReviewFocusTargetId(target: EventTarget | null): string | null {
	if (!(target instanceof HTMLElement)) {
		return null;
	}
	return (
		target.closest<HTMLElement>("[data-review-focus-target-id]")?.dataset
			.reviewFocusTargetId ?? null
	);
}

export function findReviewFocusElement(
	root: HTMLElement,
	targetId: string,
): HTMLElement | null {
	const focusTargets = root.querySelectorAll<HTMLElement>(
		"[data-review-focus-target-id]",
	);
	for (const focusTarget of focusTargets) {
		if (focusTarget.dataset.reviewFocusTargetId === targetId) {
			return focusTarget;
		}
	}
	return null;
}

export function shouldDefaultSubgroupExpanded(
	groupItemCount: number,
	subgroupItemCount: number,
): boolean {
	return !(groupItemCount > 2 && subgroupItemCount > 1);
}

export function formatReviewComparisonKindLabel(
	kind: StructuralReviewComparisonRow["changeKind"],
): string {
	return REVIEW_COMPARISON_KIND_LABELS[kind];
}

export function formatReviewItemKindLabel(
	kind: StructuralReviewItem["changeKind"],
): string {
	return REVIEW_ITEM_KIND_LABELS[kind];
}

export function formatReviewItemSectionLabel(
	section: StructuralReviewItem["section"],
): string {
	return REVIEW_ITEM_SECTION_LABELS[section];
}

export function formatSuggestionAction(action: string): string {
	switch (action) {
		case "insert":
		case "insert-block":
			return "Insert";
		case "delete":
		case "delete-block":
			return "Delete";
		case "move-block":
			return "Move";
		case "convert-block":
			return "Convert";
		default:
			return "Change";
	}
}

export function describeBlockSuggestion(
	action: string,
	blockType: string | null,
): string {
	const typeLabel = blockType ?? "block";
	switch (action) {
		case "insert-block":
			return `Insert ${typeLabel}`;
		case "delete-block":
			return `Delete ${typeLabel}`;
		case "move-block":
			return `Move ${typeLabel}`;
		case "convert-block":
			return `Convert ${typeLabel}`;
		default:
			return typeLabel;
	}
}

export function formatReviewSubgroupLabel(
	section: StructuralReviewItem["section"],
	kind: StructuralReviewItem["changeKind"],
): string {
	const sectionLabel = formatReviewItemSectionLabel(section).replace(/ changes$/, "");
	return `${sectionLabel} ${REVIEW_ITEM_KIND_NOUNS[kind]}`;
}
