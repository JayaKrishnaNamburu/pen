import React from "react";
import {
	InlineContent,
	type InlineContentProps,
} from "../primitives/editor/inlineContent";

const LIST_ITEM_INDENT_PX = 24;
const LIST_ITEM_COLUMN_GAP_PX = 8;
const LIST_ITEM_CONTENT_MIN_HEIGHT_EM = 1.5;

/**
 * Host-facing attributes for cloning a default list-item renderer (HB8).
 * Spread onto {@link ListItemLayout} before library attributes so `data-block-type`,
 * `data-indent`, `data-selected`, `data-pen-list-item-layout`, `data-counter`,
 * and `data-checked` cannot be overwritten.
 */
export type ListItemHostAttributes = {
	extraAttributes?: Record<string, unknown>;
} & Record<`data-${string}`, unknown>;

export interface ListItemLayoutProps extends ListItemHostAttributes {
	blockId: string;
	blockType: "bulletListItem" | "numberedListItem" | "checkListItem";
	indent: number;
	selected?: boolean;
	decorations?: InlineContentProps["decorations"];
	marker: React.ReactNode;
	ref?: React.Ref<HTMLDivElement>;
	/** Renderer-owned attributes, written after host attributes so a host cannot replace them. */
	libraryAttributes?: Record<string, unknown>;
}

export function ListItemLayout(props: ListItemLayoutProps): React.ReactElement {
	const {
		blockId,
		blockType,
		indent,
		selected,
		decorations,
		marker,
		ref,
		extraAttributes,
		libraryAttributes,
		...rest
	} = props;

	return (
		<div
			ref={ref}
			style={{
				paddingLeft: `${indent * LIST_ITEM_INDENT_PX}px`,
				display: "grid",
				gridTemplateColumns: "max-content minmax(0, 1fr)",
				columnGap: `${LIST_ITEM_COLUMN_GAP_PX}px`,
				alignItems: "start",
			}}
			{...rest}
			{...extraAttributes}
			data-block-type={blockType}
			data-indent={indent}
			data-selected={selected ? "" : undefined}
			data-pen-list-item-layout=""
			{...libraryAttributes}
		>
			<div
				data-pen-list-item-marker=""
				style={{
					display: "flex",
					alignItems: "center",
					minHeight: `${LIST_ITEM_CONTENT_MIN_HEIGHT_EM}em`,
				}}
			>
				{marker}
			</div>
			<div data-pen-list-item-content="" style={{ minWidth: 0 }}>
				<InlineContent blockId={blockId} decorations={decorations} />
			</div>
		</div>
	);
}
