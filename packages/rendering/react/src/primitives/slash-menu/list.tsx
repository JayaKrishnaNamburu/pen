import React from "react";
import { getSlashMenuOptionId, useSlashMenuContext } from "./root";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import {
	displayCatalogForEditor,
	resolveSlashMenuGroup,
	resolveSlashMenuTitle,
} from "../../utils/displayCopy";
import { SlashMenuGroup } from "./group";
import { SlashMenuItem } from "./item";

export interface SlashMenuListProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

/**
 * Two modes:
 * - Auto mode (no children): populates from registry.allBlockDisplays()
 * - Manual mode (has children): consumer provides explicit items
 */
export function SlashMenuList(props: SlashMenuListProps) {
	const { children, ...rest } = props;
	const { items, listboxId, selectedIndex, editor } = useSlashMenuContext();
	const activeOptionId =
		items.length > 0
			? getSlashMenuOptionId(listboxId, selectedIndex)
			: undefined;

	const hasManualChildren = React.Children.count(children) > 0;

	let content: React.ReactNode;
	if (hasManualChildren) {
		content = children;
	} else {
		const catalog = displayCatalogForEditor(editor);
		const groups = new Map<string, typeof items>();
		for (const item of items) {
			const group = item.display.group ?? "other";
			const existing = groups.get(group) ?? [];
			existing.push(item);
			groups.set(group, existing);
		}

		let globalIndex = 0;
		const groupElements = Array.from(groups.entries()).map(
			([group, groupItems]) => {
				const heading = resolveSlashMenuGroup(group, catalog);
				const itemElements = groupItems.map((item) => {
					const idx = globalIndex++;
					return (
						<SlashMenuItem
							key={item.type}
							blockType={item.type}
							index={idx}
						>
							{resolveSlashMenuTitle(
								item.type,
								item.display.title,
								catalog,
							)}
						</SlashMenuItem>
					);
				});
				return (
					<SlashMenuGroup key={group} heading={heading}>
						{itemElements}
					</SlashMenuGroup>
				);
			},
		);

		content = groupElements;
	}

	const primitiveProps: Record<string, unknown> = {
		id: listboxId,
		"data-pen-slash-menu-list": "",
		role: "listbox",
		"aria-activedescendant": activeOptionId,
	};

	return renderAsChild({ ...rest, children: content }, "div", primitiveProps);
}
