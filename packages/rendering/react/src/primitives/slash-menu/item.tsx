import React from "react";
import { useSlashMenuContext } from "./root";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";

export interface SlashMenuItemProps extends AsChildProps {
	blockType?: string;
	onSelect?: () => void;
	ref?: React.Ref<HTMLElement>;
	[key: string]: unknown;
}

export function SlashMenuItem(props: SlashMenuItemProps) {
	const { blockType, onSelect, ...rest } = props;
	const { confirm } = useSlashMenuContext();

	const handleClick = () => {
		if (onSelect) {
			onSelect();
		} else {
			confirm();
		}
	};

	const primitiveProps: Record<string, unknown> = {
		"data-pen-slash-menu-item": "",
		"data-block-type": blockType,
		role: "option",
		onClick: handleClick,
	};

	return renderAsChild(rest, "div", primitiveProps);
}
