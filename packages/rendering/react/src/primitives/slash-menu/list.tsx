import React from "react";
import { resolveEditorMessage, slashMenuGroupOf } from "@input/pen-core";
import { DEFAULT_MESSAGE_CATALOG } from "@input/pen-types";
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
	const { items, listboxId, open, selectedIndex, editor } =
		useSlashMenuContext();
	const activeOptionId =
		open && items.length > 0
			? getSlashMenuOptionId(listboxId, selectedIndex)
			: undefined;
	const listLabel = editor
		? resolveEditorMessage(editor, "pen.slash.list.label")
		: DEFAULT_MESSAGE_CATALOG["pen.slash.list.label"];

	const hasManualChildren = React.Children.count(children) > 0;

	let content: React.ReactNode;
	if (hasManualChildren) {
		content = children;
	} else {
		const catalog = displayCatalogForEditor(editor);

		// group headings break up consecutive runs rather than regrouping, so
		// every item keeps its index in `items` — the index `confirm` resolves.
		const runs: Array<{
			group: string;
			entries: Array<{ item: (typeof items)[number]; index: number }>;
		}> = [];
		items.forEach((item, index) => {
			const group = slashMenuGroupOf(item.display);
			const openRun = runs[runs.length - 1];
			if (openRun?.group === group) {
				openRun.entries.push({ item, index });
				return;
			}
			runs.push({ group, entries: [{ item, index }] });
		});

		const groupElements = runs.map((run) => {
			const itemElements = run.entries.map(({ item, index }) => (
				<SlashMenuItem
					key={item.type}
					blockType={item.type}
					index={index}
				>
					{resolveSlashMenuTitle(
						item.type,
						item.display.title,
						catalog,
					)}
				</SlashMenuItem>
			));
			return (
				<SlashMenuGroup
					key={run.entries[0]!.item.type}
					heading={resolveSlashMenuGroup(run.group, catalog)}
				>
					{itemElements}
				</SlashMenuGroup>
			);
		});

		content = groupElements;
	}

	const primitiveProps: Record<string, unknown> = {
		id: listboxId,
		"data-pen-slash-menu-list": "",
		hidden: open ? undefined : true,
		role: open ? "listbox" : undefined,
		"aria-label": open ? listLabel : undefined,
		"aria-activedescendant": activeOptionId,
	};

	return renderAsChild({ ...rest, children: content }, "div", primitiveProps);
}
