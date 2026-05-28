import React from "react";
import {
	InlineContent,
	type InlineContentProps,
} from "../primitives/editor/inlineContent";

const LIST_ITEM_INDENT_PX = 24;
const LIST_ITEM_COLUMN_GAP_PX = 8;
const LIST_ITEM_CONTENT_MIN_HEIGHT_EM = 1.5;

export interface ListItemLayoutProps {
	blockId: string;
	blockType: "bulletListItem" | "numberedListItem" | "checkListItem";
	indent: number;
	selected?: boolean;
	decorations?: InlineContentProps["decorations"];
	marker: React.ReactNode;
	ref?: React.Ref<HTMLDivElement>;
	extraAttributes?: Record<string, unknown>;
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
	} = props;

	return (
		<div
			ref={ref}
			data-block-type={blockType}
			data-indent={indent}
			data-selected={selected || undefined}
			data-pen-list-item-layout=""
			style={{
				paddingLeft: `${indent * LIST_ITEM_INDENT_PX}px`,
				display: "grid",
				gridTemplateColumns: "max-content minmax(0, 1fr)",
				columnGap: `${LIST_ITEM_COLUMN_GAP_PX}px`,
				alignItems: "start",
			}}
			{...extraAttributes}
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
