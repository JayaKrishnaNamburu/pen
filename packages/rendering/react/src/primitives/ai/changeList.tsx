import React from "react";
import type { StructuralReviewComparisonRow, StructuralReviewItem } from "@pen/ai";
import { useAIStructuredPreview } from "../../hooks/useAIStructuredPreview";
import { useSuggestions } from "../../hooks/useSuggestions";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { cancelStreamingAIGenerationAfterResolution } from "../../utils/cancelStreamingAIGeneration";
import { composeRefs } from "../../utils/composeRefs";
import { useAIContext } from "./root";

export interface AIChangeListProps extends AsChildProps {
	emptyState?: React.ReactNode;
	ref?: React.Ref<HTMLElement>;
}

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

interface ReviewFocusTarget {
	id: string;
	type: "group" | "subgroup" | "item";
	parentId?: string;
	toggle?: () => void;
	expand?: () => void;
	collapse?: () => void;
	accept?: () => void;
	reject?: () => void;
}

export function AIChangeList(props: AIChangeListProps) {
	const { emptyState, ref, ...rest } = props;
	const { editor, controller, state } = useAIContext();

	const suggestions = useSuggestions(editor);
	const generation = state.activeGeneration;
	const structuredPreview = useAIStructuredPreview(editor, generation);
	const rootRef = React.useRef<HTMLElement | null>(null);
	const activeSessionId = generation?.sessionId ?? null;

	function acceptSuggestionAndStop(suggestionId: string): void {
		const accepted = controller?.acceptSuggestion(suggestionId) ?? false;
		if (!accepted) {
			return;
		}
		cancelStreamingAIGenerationAfterResolution(controller, {
			sessionId: activeSessionId,
			suggestionIds: [suggestionId],
			suggestions,
		});
	}

	function rejectSuggestionAndStop(suggestionId: string): void {
		const rejected = controller?.rejectSuggestion(suggestionId) ?? false;
		if (!rejected) {
			return;
		}
		cancelStreamingAIGenerationAfterResolution(controller, {
			sessionId: activeSessionId,
			suggestionIds: [suggestionId],
			suggestions,
		});
	}

	function acceptReviewItemsAndStop(reviewItemIds: readonly string[]): void {
		const accepted = controller?.acceptReviewItems(reviewItemIds) ?? false;
		if (!accepted) {
			return;
		}
		cancelStreamingAIGenerationAfterResolution(controller, {
			sessionId: activeSessionId,
		});
	}

	function rejectReviewItemsAndStop(reviewItemIds: readonly string[]): void {
		const rejected = controller?.rejectReviewItems(reviewItemIds) ?? false;
		if (!rejected) {
			return;
		}
		cancelStreamingAIGenerationAfterResolution(controller, {
			sessionId: activeSessionId,
		});
	}

	function acceptReviewItemAndStop(reviewItemId: string): void {
		const accepted = controller?.acceptReviewItem(reviewItemId) ?? false;
		if (!accepted) {
			return;
		}
		cancelStreamingAIGenerationAfterResolution(controller, {
			sessionId: activeSessionId,
		});
	}

	function rejectReviewItemAndStop(reviewItemId: string): void {
		const rejected = controller?.rejectReviewItem(reviewItemId) ?? false;
		if (!rejected) {
			return;
		}
		cancelStreamingAIGenerationAfterResolution(controller, {
			sessionId: activeSessionId,
		});
	}
	const [subgroupExpandedState, setSubgroupExpandedState] = React.useState<
		Record<string, boolean>
	>({});
	const [activeReviewTargetId, setActiveReviewTargetId] = React.useState<
		string | null
	>(null);
	const previewReviewItems = structuredPreview.preview?.reviewItems ?? [];
	const isPreviewActive =
		generation?.status === "streaming" && previewReviewItems.length > 0;
	const structuralReviewItems = isPreviewActive
		? previewReviewItems
		: (generation?.reviewItems ?? []);
	const canApplyReviewActions =
		generation?.status !== "streaming" && generation?.planState === "validated";
	const structuralReviewGroups = groupStructuralReviewItems(structuralReviewItems);

	function toggleSubgroupExpanded(
		subgroupKey: string,
		defaultExpanded: boolean,
	): void {
		setSubgroupExpandedState((currentState) => ({
			...currentState,
			[subgroupKey]: !(currentState[subgroupKey] ?? defaultExpanded),
		}));
	}

	const reviewFocusTargets: ReviewFocusTarget[] = [];

	const suggestionItems = suggestions.map((suggestion) => {
		const block = editor.getBlock(suggestion.blockId);
		const text =
			suggestion.kind === "text"
				? (block?.textContent().slice(
						suggestion.offset,
						suggestion.offset + suggestion.length,
					) ?? "")
				: describeBlockSuggestion(suggestion.action, block?.type ?? null);

		return (
			<div
				key={suggestion.id}
				data-suggestion-id={suggestion.id}
				data-action={suggestion.action}
				data-block-id={suggestion.blockId}
				data-suggestion-item=""
			>
				<div data-suggestion-summary>
					<span data-suggestion-action>
						{formatSuggestionAction(suggestion.action)}
					</span>
					<span data-suggestion-text>
						{text || "(structural suggestion)"}
					</span>
				</div>
				<div data-suggestion-actions>
					<button
						type="button"
						data-suggestion-button=""
						onMouseDown={preventEditorBlur}
						onClick={() => acceptSuggestionAndStop(suggestion.id)}
					>
						Accept
					</button>
					<button
						type="button"
						data-suggestion-button=""
						onMouseDown={preventEditorBlur}
						onClick={() => rejectSuggestionAndStop(suggestion.id)}
					>
						Reject
					</button>
				</div>
			</div>
		);
	});

	const structuralReviewGroupNodes = structuralReviewGroups.map((group) => {
		const groupRollups = summarizeStructuralReviewGroup(group.items);
		const subgroups = groupStructuralReviewSubgroups(group.items);
		const groupItemIds = group.items.map((item) => item.id);
		const groupFocusTargetId = createReviewGroupFocusTargetId(group.id);
		reviewFocusTargets.push({
			id: groupFocusTargetId,
			type: "group",
			accept: canApplyReviewActions
				? () => {
						acceptReviewItemsAndStop(groupItemIds);
					}
				: undefined,
			reject: canApplyReviewActions
				? () => {
						rejectReviewItemsAndStop(groupItemIds);
					}
				: undefined,
		});
		const groupKindRollupNodes = groupRollups.kindRollups.map((rollup) => (
			<span
				key={`${group.id}:kind:${rollup.id}`}
				data-review-group-kind-rollup=""
				data-review-group-kind-rollup-id={rollup.id}
			>
				<span data-review-group-kind-rollup-label>{rollup.label}</span>
				<span data-review-group-kind-rollup-count>{rollup.count}</span>
			</span>
		));
		const groupSectionRollupNodes = groupRollups.sectionRollups.map((rollup) => (
			<span
				key={`${group.id}:section:${rollup.id}`}
				data-review-group-section-rollup=""
				data-review-group-section-rollup-id={rollup.id}
			>
				<span data-review-group-section-rollup-label>{rollup.label}</span>
				<span data-review-group-section-rollup-count>{rollup.count}</span>
			</span>
		));
		const groupActionNodes = (
			<div data-review-group-actions>
				<button
					type="button"
					data-review-group-button=""
					disabled={!canApplyReviewActions}
					onMouseDown={preventEditorBlur}
					onClick={() => acceptReviewItemsAndStop(groupItemIds)}
				>
					Accept group
				</button>
				<button
					type="button"
					data-review-group-button=""
					disabled={!canApplyReviewActions}
					onMouseDown={preventEditorBlur}
					onClick={() => rejectReviewItemsAndStop(groupItemIds)}
				>
					Reject group
				</button>
			</div>
		);
		const structuralReviewSubgroupNodes = subgroups.map((subgroup) => {
			const subgroupKey = createReviewSubgroupKey(group.id, subgroup.id);
			const defaultExpanded = shouldDefaultSubgroupExpanded(
				group.items.length,
				subgroup.items.length,
			);
			const isExpanded =
				subgroupExpandedState[subgroupKey] ?? defaultExpanded;
			const subgroupItemIds = subgroup.items.map((item) => item.id);
			const subgroupToggleLabel = isExpanded ? "Collapse" : "Expand";
			const subgroupFocusTargetId = createReviewSubgroupFocusTargetId(
				group.id,
				subgroup.id,
			);
			reviewFocusTargets.push({
				id: subgroupFocusTargetId,
				type: "subgroup",
				toggle: () => {
					toggleSubgroupExpanded(subgroupKey, defaultExpanded);
				},
				expand: isExpanded
					? undefined
					: () => {
							toggleSubgroupExpanded(subgroupKey, defaultExpanded);
						},
				collapse: isExpanded
					? () => {
							toggleSubgroupExpanded(subgroupKey, defaultExpanded);
						}
					: undefined,
				accept: () => {
					if (canApplyReviewActions) {
						acceptReviewItemsAndStop(subgroupItemIds);
					}
				},
				reject: () => {
					if (canApplyReviewActions) {
						rejectReviewItemsAndStop(subgroupItemIds);
					}
				},
			});
			const subgroupActionNodes = (
				<div data-review-subgroup-actions>
					<button
						type="button"
						data-review-subgroup-toggle=""
						onMouseDown={preventEditorBlur}
						onClick={() => toggleSubgroupExpanded(subgroupKey, defaultExpanded)}
					>
						{subgroupToggleLabel}
					</button>
					<button
						type="button"
						data-review-subgroup-button=""
						disabled={!canApplyReviewActions}
						onMouseDown={preventEditorBlur}
						onClick={() => acceptReviewItemsAndStop(subgroupItemIds)}
					>
						Accept subgroup
					</button>
					<button
						type="button"
						data-review-subgroup-button=""
						disabled={!canApplyReviewActions}
						onMouseDown={preventEditorBlur}
						onClick={() => rejectReviewItemsAndStop(subgroupItemIds)}
					>
						Reject subgroup
					</button>
				</div>
			);
			const structuralReviewItemNodes = subgroup.items.map((item) => {
				const itemFocusTargetId = createReviewItemFocusTargetId(item.id);
				if (isExpanded) {
					reviewFocusTargets.push({
						id: itemFocusTargetId,
						type: "item",
						parentId: subgroupFocusTargetId,
						collapse: () => {
							toggleSubgroupExpanded(subgroupKey, defaultExpanded);
						},
						accept: () => {
							if (canApplyReviewActions) {
								acceptReviewItemAndStop(item.id);
							}
						},
						reject: () => {
							if (canApplyReviewActions) {
								rejectReviewItemAndStop(item.id);
							}
						},
					});
				}
				const reviewItemPreview =
					item.preview != null && item.preview.length > 0 ? (
						<span data-review-item-preview>{item.preview}</span>
					) : null;
				const comparisonRows = item.comparisonRows ?? [];
				const comparisonSections = groupReviewComparisonRows(comparisonRows);
				const reviewItemComparisonSectionNodes = comparisonSections.map((section) => {
					const reviewItemComparisonRowNodes = section.rows.map((row, index) => (
						<div
							key={`${item.id}:comparison:${section.id}:${index}`}
							data-review-comparison-row=""
							data-review-comparison-kind={row.changeKind}
							data-review-comparison-section={row.section}
						>
							<span data-review-comparison-kind-label>
								{formatReviewComparisonKindLabel(row.changeKind)}
							</span>
							<span data-review-comparison-label>{row.label}</span>
							{row.before != null ? (
								<span data-review-comparison-before>{row.before}</span>
							) : null}
							{row.after != null ? (
								<span data-review-comparison-after>{row.after}</span>
							) : null}
						</div>
					));

					return (
						<div
							key={`${item.id}:section:${section.id}`}
							data-review-comparison-section-group=""
							data-review-comparison-section-id={section.id}
						>
							<div data-review-comparison-section-summary>
								<span data-review-comparison-section-label>{section.label}</span>
								<span data-review-comparison-section-count>
									{section.rows.length}
								</span>
							</div>
							{reviewItemComparisonRowNodes}
						</div>
					);
				});
				const reviewItemDiff =
					item.before != null || item.after != null ? (
						<div data-review-item-diff>
							{item.before != null ? (
								<span data-review-item-before>{item.before}</span>
							) : null}
							{item.after != null ? (
								<span data-review-item-after>{item.after}</span>
							) : null}
						</div>
					) : null;

				return (
					<div
						key={item.id}
						tabIndex={0}
						onFocus={(event) => {
							if (event.target === event.currentTarget) {
								setActiveReviewTargetId(itemFocusTargetId);
							}
						}}
						data-review-item-id={item.id}
						data-review-item-kind={item.targetKind}
						data-review-item-change-kind={item.changeKind}
						data-review-item-section={item.section}
						data-review-focus-target=""
						data-review-focus-target-id={itemFocusTargetId}
						data-review-focus-active={
							activeReviewTargetId === itemFocusTargetId ? "" : undefined
						}
						data-review-item=""
					>
						<div data-suggestion-summary>
							<span data-suggestion-action>{item.label}</span>
							<span data-suggestion-text>{item.summary}</span>
						</div>
						<div data-review-item-meta>
							<span data-review-item-section-label>
								{formatReviewItemSectionLabel(item.section)}
							</span>
							<span data-review-item-kind-label>
								{formatReviewItemKindLabel(item.changeKind)}
							</span>
							{item.detail ? (
								<span data-review-item-detail>{item.detail}</span>
							) : null}
							{reviewItemPreview}
						</div>
						{reviewItemDiff}
						{reviewItemComparisonSectionNodes.length > 0 ? (
							<div data-review-comparison-list="">
								{reviewItemComparisonSectionNodes}
							</div>
						) : null}
						<div data-suggestion-actions>
							<button
								type="button"
								data-suggestion-button=""
								disabled={!canApplyReviewActions}
								onMouseDown={preventEditorBlur}
								onClick={() => acceptReviewItemAndStop(item.id)}
							>
								Accept
							</button>
							<button
								type="button"
								data-suggestion-button=""
								disabled={!canApplyReviewActions}
								onMouseDown={preventEditorBlur}
								onClick={() => rejectReviewItemAndStop(item.id)}
							>
								Reject
							</button>
						</div>
					</div>
				);
			});

			return (
				<div
					key={`${group.id}:subgroup:${subgroup.id}`}
					tabIndex={0}
					onFocus={(event) => {
						if (event.target === event.currentTarget) {
							setActiveReviewTargetId(subgroupFocusTargetId);
						}
					}}
					data-review-subgroup=""
					data-review-subgroup-id={subgroup.id}
					data-review-subgroup-expanded={isExpanded ? "true" : "false"}
					data-review-focus-target=""
					data-review-focus-target-id={subgroupFocusTargetId}
					data-review-focus-active={
						activeReviewTargetId === subgroupFocusTargetId ? "" : undefined
					}
				>
					<div data-review-subgroup-summary>
						<span data-review-subgroup-label>{subgroup.label}</span>
						<span data-review-subgroup-count>{subgroup.items.length}</span>
					</div>
					{subgroupActionNodes}
					{isExpanded ? structuralReviewItemNodes : null}
				</div>
			);
		});

		return (
			<div
				key={group.id}
				tabIndex={0}
				onFocus={(event) => {
					if (event.target === event.currentTarget) {
						setActiveReviewTargetId(groupFocusTargetId);
					}
				}}
				data-review-group=""
				data-review-group-id={group.id}
				data-review-focus-target=""
				data-review-focus-target-id={groupFocusTargetId}
				data-review-focus-active={
					activeReviewTargetId === groupFocusTargetId ? "" : undefined
				}
			>
				<div data-review-group-summary>
					<span data-review-group-label>{group.label}</span>
					<span data-review-group-count>{group.items.length}</span>
				</div>
				{groupKindRollupNodes.length > 0 ? (
					<div data-review-group-kind-rollups>{groupKindRollupNodes}</div>
				) : null}
				{groupSectionRollupNodes.length > 0 ? (
					<div data-review-group-section-rollups>{groupSectionRollupNodes}</div>
				) : null}
				{groupActionNodes}
				{structuralReviewSubgroupNodes}
			</div>
		);
	});

	const firstReviewFocusTargetId = reviewFocusTargets[0]?.id ?? null;

	React.useEffect(() => {
		if (firstReviewFocusTargetId == null) {
			if (activeReviewTargetId != null) {
				setActiveReviewTargetId(null);
			}
			return;
		}
		if (
			activeReviewTargetId == null ||
			!reviewFocusTargets.some((target) => target.id === activeReviewTargetId)
		) {
			setActiveReviewTargetId(firstReviewFocusTargetId);
		}
	}, [activeReviewTargetId, firstReviewFocusTargetId, reviewFocusTargets]);

	React.useEffect(() => {
		if (!rootRef.current || !activeReviewTargetId) {
			return;
		}
		const targetElement = findReviewFocusElement(rootRef.current, activeReviewTargetId);
		if (targetElement && document.activeElement !== targetElement) {
			targetElement.focus();
		}
	}, [activeReviewTargetId, structuralReviewItems.length, subgroupExpandedState]);

	function focusReviewTarget(targetId: string | null): void {
		setActiveReviewTargetId(targetId);
		if (!rootRef.current || targetId == null) {
			return;
		}
		const targetElement = findReviewFocusElement(rootRef.current, targetId);
		targetElement?.focus();
	}

	function moveReviewFocus(direction: -1 | 1): void {
		const currentIndex = reviewFocusTargets.findIndex(
			(target) => target.id === activeReviewTargetId,
		);
		const nextIndex =
			currentIndex === -1
				? 0
				: clampReviewFocusIndex(
						currentIndex + direction,
						reviewFocusTargets.length - 1,
					);
		const nextTarget = reviewFocusTargets[nextIndex];
		if (nextTarget) {
			focusReviewTarget(nextTarget.id);
		}
	}

	function handleReviewListFocus(event: React.FocusEvent<HTMLElement>): void {
		if (
			event.target === event.currentTarget &&
			firstReviewFocusTargetId != null
		) {
			setActiveReviewTargetId(firstReviewFocusTargetId);
			const firstReviewFocusElement = findReviewFocusElement(
				event.currentTarget,
				firstReviewFocusTargetId,
			);
			firstReviewFocusElement?.focus();
		}
	}

	function handleReviewListKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
		if (reviewFocusTargets.length === 0) {
			return;
		}
		const currentTarget =
			resolveReviewFocusTarget(
				reviewFocusTargets,
				resolveReviewFocusTargetId(event.target),
			) ??
			resolveReviewFocusTarget(reviewFocusTargets, activeReviewTargetId);
		if (!currentTarget) {
			return;
		}

		switch (event.key) {
			case "ArrowDown":
				event.preventDefault();
				moveReviewFocus(1);
				return;
			case "ArrowUp":
				event.preventDefault();
				moveReviewFocus(-1);
				return;
			case "Home":
				event.preventDefault();
				if (firstReviewFocusTargetId != null) {
					focusReviewTarget(firstReviewFocusTargetId);
				}
				return;
			case "End": {
				event.preventDefault();
				const lastReviewFocusTargetId =
					reviewFocusTargets[reviewFocusTargets.length - 1]?.id ?? null;
				if (lastReviewFocusTargetId != null) {
					focusReviewTarget(lastReviewFocusTargetId);
				}
				return;
			}
			case "ArrowLeft":
				if (currentTarget.collapse) {
					event.preventDefault();
					currentTarget.collapse();
					focusReviewTarget(currentTarget.parentId ?? currentTarget.id);
				}
				return;
			case "ArrowRight":
				if (currentTarget.expand) {
					event.preventDefault();
					currentTarget.expand();
					focusReviewTarget(currentTarget.id);
				}
				return;
			case "Enter":
			case " ":
				if (currentTarget.toggle) {
					event.preventDefault();
					currentTarget.toggle();
					focusReviewTarget(currentTarget.id);
				}
				return;
			case "a":
			case "A":
				if (currentTarget.accept) {
					event.preventDefault();
					currentTarget.accept();
				}
				return;
			case "r":
			case "R":
				if (currentTarget.reject) {
					event.preventDefault();
					currentTarget.reject();
				}
				return;
		}
	}

	const renderedChildren =
		props.children ??
		(structuralReviewGroupNodes.length + suggestionItems.length > 0
			? [...structuralReviewGroupNodes, ...suggestionItems]
			: emptyState ?? <div>No pending changes.</div>);

	return renderAsChild(
		{
			...rest,
			ref: composeRefs(ref, rootRef),
			children: renderedChildren,
		},
		"div",
		{
			"data-pen-ai-change-list": "",
			"data-suggestion-count": suggestions.length,
			"data-review-item-count": structuralReviewItems.length,
			"data-review-preview-active": isPreviewActive ? "" : undefined,
			tabIndex: reviewFocusTargets.length > 0 ? 0 : undefined,
			onFocus: handleReviewListFocus,
			onKeyDown: handleReviewListKeyDown,
		},
	);
}

function preventEditorBlur(event: React.MouseEvent<HTMLButtonElement>) {
	event.preventDefault();
}

function groupStructuralReviewItems(
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

function groupReviewComparisonRows(
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

function summarizeStructuralReviewGroup(items: readonly StructuralReviewItem[]): {
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

function groupStructuralReviewSubgroups(
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

function createReviewSubgroupKey(groupId: string, subgroupId: string): string {
	return `${groupId}:${subgroupId}`;
}

function createReviewGroupFocusTargetId(groupId: string): string {
	return `group:${groupId}`;
}

function createReviewSubgroupFocusTargetId(
	groupId: string,
	subgroupId: string,
): string {
	return `subgroup:${groupId}:${subgroupId}`;
}

function createReviewItemFocusTargetId(itemId: string): string {
	return `item:${itemId}`;
}

function clampReviewFocusIndex(index: number, maxIndex: number): number {
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

function resolveReviewFocusTarget(
	targets: readonly ReviewFocusTarget[],
	targetId: string | null,
): ReviewFocusTarget | null {
	if (!targetId) {
		return null;
	}
	return targets.find((target) => target.id === targetId) ?? null;
}

function resolveReviewFocusTargetId(target: EventTarget | null): string | null {
	if (!(target instanceof HTMLElement)) {
		return null;
	}
	return (
		target.closest<HTMLElement>("[data-review-focus-target-id]")?.dataset
			.reviewFocusTargetId ?? null
	);
}

function findReviewFocusElement(
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

function shouldDefaultSubgroupExpanded(
	groupItemCount: number,
	subgroupItemCount: number,
): boolean {
	return !(groupItemCount > 2 && subgroupItemCount > 1);
}

function formatReviewComparisonKindLabel(
	kind: StructuralReviewComparisonRow["changeKind"],
): string {
	return REVIEW_COMPARISON_KIND_LABELS[kind];
}

function formatReviewItemKindLabel(
	kind: StructuralReviewItem["changeKind"],
): string {
	return REVIEW_ITEM_KIND_LABELS[kind];
}

function formatReviewItemSectionLabel(
	section: StructuralReviewItem["section"],
): string {
	return REVIEW_ITEM_SECTION_LABELS[section];
}

function formatSuggestionAction(action: string): string {
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

function describeBlockSuggestion(
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

function formatReviewSubgroupLabel(
	section: StructuralReviewItem["section"],
	kind: StructuralReviewItem["changeKind"],
): string {
	const sectionLabel = formatReviewItemSectionLabel(section).replace(/ changes$/, "");
	return `${sectionLabel} ${REVIEW_ITEM_KIND_NOUNS[kind]}`;
}
