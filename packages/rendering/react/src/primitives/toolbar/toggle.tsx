import React from "react";
import { useToolbarContext } from "../../context/toolbarContext";
import { useEditorContext } from "../../context/editorContext";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { toggleInlineMark } from "../../field-editor/commands";

export interface ToolbarToggleProps extends AsChildProps {
	format: string;
	ref?: React.Ref<HTMLElement>;
}

export function ToolbarToggle(props: ToolbarToggleProps) {
	const { format, ...rest } = props;
	const { editor, state } = useToolbarContext();
	const { readonly } = useEditorContext();

	const isActive = format in state.activeMarks;

	const handleClick = () => {
		if (readonly) return;
		toggleInlineMark(editor, format);
	};

	const primitiveProps: Record<string, unknown> = {
		"data-pen-toolbar-toggle": "",
		"data-active": isActive || undefined,
		"data-format": format,
		role: "button",
		"aria-pressed": isActive,
		onClick: handleClick,
	};

	return renderAsChild(rest, "button", primitiveProps);
}
