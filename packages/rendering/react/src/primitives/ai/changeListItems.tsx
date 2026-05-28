import React from "react";
import type { Editor } from "@pen/types";
import type { PersistentSuggestion, StructuralReviewItem } from "@pen/ai";
import {
	createReviewGroupFocusTargetId,
	createReviewItemFocusTargetId,
	createReviewSubgroupFocusTargetId,
	createReviewSubgroupKey,
	describeBlockSuggestion,
	formatReviewComparisonKindLabel,
	formatReviewItemKindLabel,
	formatReviewItemSectionLabel,
	formatSuggestionAction,
	groupReviewComparisonRows,
	groupStructuralReviewSubgroups,
	preventEditorBlur,
	shouldDefaultSubgroupExpanded,
	summarizeStructuralReviewGroup,
	type ReviewFocusTarget,
} from "./changeListUtils";

interface StructuralReviewGroup {
	id: string;
	label: string;
	items: StructuralReviewItem[];
}

export interface RenderAIChangeListItemsArgs {
	editor: Editor;
	suggestions: readonly PersistentSuggestion[];
	structuralReviewGroups: readonly StructuralReviewGroup[];
	subgroupExpandedState: Record<string, boolean>;
	activeReviewTargetId: string | null;
	canApplyReviewActions: boolean;
	acceptSuggestionAndStop(suggestionId: string): void;
	rejectSuggestionAndStop(suggestionId: string): void;
	acceptReviewItemsAndStop(reviewItemIds: readonly string[]): void;
	rejectReviewItemsAndStop(reviewItemIds: readonly string[]): void;
	acceptReviewItemAndStop(reviewItemId: string): void;
	rejectReviewItemAndStop(reviewItemId: string): void;
	toggleSubgroupExpanded(subgroupKey: string, defaultExpanded: boolean): void;
	setActiveReviewTargetId(targetId: string | null): void;
}

export function renderAIChangeListItems(
	args: RenderAIChangeListItemsArgs,
): { nodes: React.ReactNode[]; reviewFocusTargets: ReviewFocusTarget[] } {
	const {
		editor,
		suggestions,
		structuralReviewGroups,
		subgroupExpandedState,
		activeReviewTargetId,
		canApplyReviewActions,
		acceptSuggestionAndStop,
		rejectSuggestionAndStop,
		acceptReviewItemsAndStop,
		rejectReviewItemsAndStop,
		acceptReviewItemAndStop,
		rejectReviewItemAndStop,
		toggleSubgroupExpanded,
		setActiveReviewTargetId,
	} = args;
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

	return {
		nodes: [...structuralReviewGroupNodes, ...suggestionItems],
		reviewFocusTargets,
	};
}
