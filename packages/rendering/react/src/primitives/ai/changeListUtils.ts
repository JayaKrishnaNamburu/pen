import React from "react";
import { resolveEditorMessage } from "@input/pen-core";
import type {
	StructuralReviewComparisonRow,
	StructuralReviewItem,
} from "@input/pen-ai";
import type { Editor, MessageKey } from "@input/pen-types";

const REVIEW_COMPARISON_SECTION_KEYS = {
	schema: "pen.ai.review.section.schema",
	view: "pen.ai.review.section.view",
} as const satisfies Record<
	StructuralReviewComparisonRow["section"],
	MessageKey
>;

const REVIEW_ITEM_SECTION_KEYS = {
	content: "pen.ai.review.section.content",
	block: "pen.ai.review.section.block",
	row: "pen.ai.review.section.row",
	cell: "pen.ai.review.section.cell",
	schema: "pen.ai.review.section.schema",
	view: "pen.ai.review.section.view",
} as const satisfies Record<StructuralReviewItem["section"], MessageKey>;

const REVIEW_ITEM_KIND_KEYS = {
	added: "pen.ai.review.kind.added",
	removed: "pen.ai.review.kind.removed",
	updated: "pen.ai.review.kind.updated",
	moved: "pen.ai.review.kind.moved",
} as const satisfies Record<StructuralReviewItem["changeKind"], MessageKey>;

const REVIEW_SUBGROUP_KEYS = {
	content: {
		added: "pen.ai.review.subgroup.content.added",
		removed: "pen.ai.review.subgroup.content.removed",
		updated: "pen.ai.review.subgroup.content.updated",
		moved: "pen.ai.review.subgroup.content.moved",
	},
	block: {
		added: "pen.ai.review.subgroup.block.added",
		removed: "pen.ai.review.subgroup.block.removed",
		updated: "pen.ai.review.subgroup.block.updated",
		moved: "pen.ai.review.subgroup.block.moved",
	},
	row: {
		added: "pen.ai.review.subgroup.row.added",
		removed: "pen.ai.review.subgroup.row.removed",
		updated: "pen.ai.review.subgroup.row.updated",
		moved: "pen.ai.review.subgroup.row.moved",
	},
	cell: {
		added: "pen.ai.review.subgroup.cell.added",
		removed: "pen.ai.review.subgroup.cell.removed",
		updated: "pen.ai.review.subgroup.cell.updated",
		moved: "pen.ai.review.subgroup.cell.moved",
	},
	schema: {
		added: "pen.ai.review.subgroup.schema.added",
		removed: "pen.ai.review.subgroup.schema.removed",
		updated: "pen.ai.review.subgroup.schema.updated",
		moved: "pen.ai.review.subgroup.schema.moved",
	},
	view: {
		added: "pen.ai.review.subgroup.view.added",
		removed: "pen.ai.review.subgroup.view.removed",
		updated: "pen.ai.review.subgroup.view.updated",
		moved: "pen.ai.review.subgroup.view.moved",
	},
} as const satisfies Record<
	StructuralReviewItem["section"],
	Record<StructuralReviewItem["changeKind"], MessageKey>
>;

const REVIEW_COMPARISON_KIND_KEYS = {
	added: "pen.ai.review.kind.added",
	removed: "pen.ai.review.kind.removed",
	updated: "pen.ai.review.kind.updated",
} as const satisfies Record<
	StructuralReviewComparisonRow["changeKind"],
	MessageKey
>;

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
	editor: Editor,
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
			label: formatReviewComparisonSectionLabel(editor, row.section),
			rows: [row],
		});
	}

	return [...sections.values()];
}

export function summarizeStructuralReviewGroup(
	editor: Editor,
	items: readonly StructuralReviewItem[],
): {
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
		kindCounts.set(
			item.changeKind,
			(kindCounts.get(item.changeKind) ?? 0) + 1,
		);
		sectionCounts.set(
			item.section,
			(sectionCounts.get(item.section) ?? 0) + 1,
		);
	}

	const kindRollups = REVIEW_ITEM_KIND_ORDER.flatMap((kind) => {
		const count = kindCounts.get(kind);
		return count == null
			? []
			: [
					{
						id: kind,
						label: formatReviewItemKindLabel(editor, kind),
						count,
					},
				];
	});
	const sectionRollups = REVIEW_ITEM_SECTION_ORDER.flatMap((section) => {
		const count = sectionCounts.get(section);
		return count == null
			? []
			: [
					{
						id: section,
						label: formatReviewItemSectionLabel(editor, section),
						count,
					},
				];
	});

	return { kindRollups, sectionRollups };
}

export function groupStructuralReviewSubgroups(
	editor: Editor,
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
			label: formatReviewSubgroupLabel(
				editor,
				item.section,
				item.changeKind,
			),
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

export function createReviewSubgroupKey(
	groupId: string,
	subgroupId: string,
): string {
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

export function resolveReviewFocusTargetId(
	target: EventTarget | null,
): string | null {
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

function formatReviewComparisonSectionLabel(
	editor: Editor,
	section: StructuralReviewComparisonRow["section"],
): string {
	return resolveEditorMessage(
		editor,
		REVIEW_COMPARISON_SECTION_KEYS[section],
	);
}

export function formatReviewComparisonKindLabel(
	editor: Editor,
	kind: StructuralReviewComparisonRow["changeKind"],
): string {
	return resolveEditorMessage(editor, REVIEW_COMPARISON_KIND_KEYS[kind]);
}

export function formatReviewItemKindLabel(
	editor: Editor,
	kind: StructuralReviewItem["changeKind"],
): string {
	return resolveEditorMessage(editor, REVIEW_ITEM_KIND_KEYS[kind]);
}

export function formatReviewItemSectionLabel(
	editor: Editor,
	section: StructuralReviewItem["section"],
): string {
	return resolveEditorMessage(editor, REVIEW_ITEM_SECTION_KEYS[section]);
}

export function formatSuggestionAction(editor: Editor, action: string): string {
	switch (action) {
		case "insert":
		case "insert-block":
			return resolveEditorMessage(editor, "pen.ai.review.action.insert");
		case "delete":
		case "delete-block":
			return resolveEditorMessage(editor, "pen.ai.review.action.delete");
		case "move-block":
			return resolveEditorMessage(editor, "pen.ai.review.action.move");
		case "convert-block":
			return resolveEditorMessage(editor, "pen.ai.review.action.convert");
		default:
			return resolveEditorMessage(editor, "pen.ai.review.action.change");
	}
}

export function describeBlockSuggestion(
	editor: Editor,
	action: string,
	blockType: string | null,
): string {
	const typeLabel =
		blockType ??
		resolveEditorMessage(editor, "pen.ai.review.blockType.fallback");
	switch (action) {
		case "insert-block":
			return resolveEditorMessage(
				editor,
				"pen.ai.review.blockSuggestion.insert",
				{ blockType: typeLabel },
			);
		case "delete-block":
			return resolveEditorMessage(
				editor,
				"pen.ai.review.blockSuggestion.delete",
				{ blockType: typeLabel },
			);
		case "move-block":
			return resolveEditorMessage(
				editor,
				"pen.ai.review.blockSuggestion.move",
				{
					blockType: typeLabel,
				},
			);
		case "convert-block":
			return resolveEditorMessage(
				editor,
				"pen.ai.review.blockSuggestion.convert",
				{ blockType: typeLabel },
			);
		default:
			return typeLabel;
	}
}

function formatReviewSubgroupLabel(
	editor: Editor,
	section: StructuralReviewItem["section"],
	kind: StructuralReviewItem["changeKind"],
): string {
	return resolveEditorMessage(editor, REVIEW_SUBGROUP_KEYS[section][kind]);
}
