import React from "react";
import type { GenerationStructuredPreviewState } from "@pen/ai";
import { useActiveAIStructuredPreview } from "../../hooks/useAIStructuredPreview";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import { useAIContext } from "./root";

export type StructuredPreviewTargetState =
	GenerationStructuredPreviewState["targets"][number];

export interface AIStructuredTargetPreviewProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AIStructuredTargetPreview(props: AIStructuredTargetPreviewProps) {
	const { editor } = useAIContext();
	const structuredPreview = useActiveAIStructuredPreview(editor);
	const targets = structuredPreview.preview?.targets ?? [];

	if (targets.length === 0) {
		return null;
	}

	const targetPreviewItems = targets.map((target) => (
		<AIStructuredTargetPreviewItem
			key={`${target.targetKind}:${target.blockId}`}
			target={target}
		/>
	));

	return renderAsChild(
		{
			...props,
			children: targetPreviewItems,
		},
		"div",
		{
			"data-pen-ai-structured-target-preview": "",
			"data-target-count": targets.length,
			"data-plan-state": structuredPreview.preview?.planState ?? undefined,
		},
	);
}

export function AIStructuredTargetPreviewItem(props: {
	target: StructuredPreviewTargetState;
}) {
	return <StructuredDatabaseTargetPreview target={props.target} />;
}

function StructuredDatabaseTargetPreview(props: {
	target: Extract<StructuredPreviewTargetState, { targetKind: "database" }>;
}) {
	const { target } = props;
	const activeViewId = target.database.primaryViewId;
	const viewItems = target.database.views.map((view) => (
		<span
			key={view.id}
			data-structured-preview-view=""
			data-active={view.id === activeViewId ? "" : undefined}
		>
			{view.title}
		</span>
	));
	const headerLabels = target.database.columns.map((column) => column.title || column.id);
	const headerCells = headerLabels.map((label: string, index: number) => (
		<th key={`${target.blockId}-db-header-${index}`} data-structured-preview-header-cell="">
			{label}
		</th>
	));
	const bodyRows = target.database.rows.map((row) => {
		const cells = target.database.columns.map((column) => (
			<td
				key={`${row.id}-${column.id}`}
				data-structured-preview-cell=""
			>
				{row.values[column.id] ?? ""}
			</td>
		));
		return (
			<tr key={row.id} data-structured-preview-row="" data-row-id={row.id}>
				{cells}
			</tr>
		);
	});

	return (
		<section
			data-structured-target-preview-item=""
			data-structured-target-kind="database"
			{...{ [DATA_ATTRS.ignorePointerGesture]: "" }}
		>
			<div data-structured-target-preview-title="">
				Database preview
			</div>
			<div data-structured-target-preview-summary="">
				{target.database.rows.length} rows, {target.database.columns.length} columns, {target.database.views.length} views
			</div>
			<div data-structured-target-preview-views="">
				{viewItems}
			</div>
			<div data-structured-target-preview-frame="">
				<table data-structured-target-preview-table="">
					<thead>
						<tr data-structured-preview-row="header">{headerCells}</tr>
					</thead>
					<tbody>{bodyRows}</tbody>
				</table>
			</div>
		</section>
	);
}
