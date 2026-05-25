import React from "react";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useAIContext } from "./root";

export interface AIContextualPromptTriggerProps extends AsChildProps {
	shortcut?: string;
	ref?: React.Ref<HTMLElement>;
}

export function AIContextualPromptTrigger(
	props: AIContextualPromptTriggerProps,
) {
	const { shortcut, ...rest } = props;
	const { controller, editor } = useAIContext();
	const activeSelection = editor.selection;
	const isSelectionEligible =
		activeSelection?.type === "text" && !activeSelection.isCollapsed;

	const openContextualPrompt = React.useCallback(() => {
		if (!isSelectionEligible) {
			return;
		}
		controller?.openContextualPrompt({
			surface: "inline-edit",
			target: "selection",
		});
	}, [controller, isSelectionEligible]);

	const handleClick = () => {
		openContextualPrompt();
	};

	const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
		event.preventDefault();
		openContextualPrompt();
	};

	React.useEffect(() => {
		if (!shortcut) {
			return;
		}
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!matchesShortcut(event, shortcut)) {
				return;
			}
			event.preventDefault();
			openContextualPrompt();
		};
		document.addEventListener("keydown", handleKeyDown, true);
		return () => document.removeEventListener("keydown", handleKeyDown, true);
	}, [openContextualPrompt, shortcut]);

	const triggerProps: AsChildProps & {
		ref?: React.Ref<HTMLElement>;
	} & Record<string, unknown> = {
		...rest,
		onPointerDown: handlePointerDown,
		onClick: handleClick,
	};

	return renderAsChild(
		triggerProps,
		"button",
		{
			type: "button",
			"data-pen-ai-contextual-prompt-trigger": "",
			disabled: !isSelectionEligible,
		},
	);
}

function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
	const parts = shortcut
		.toLowerCase()
		.split("+")
		.map((part) => part.trim())
		.filter(Boolean);
	const key = parts[parts.length - 1];
	const expectsMeta = parts.includes("mod")
		? navigator.platform.toLowerCase().includes("mac")
		: parts.includes("meta") || parts.includes("cmd");
	const expectsCtrl = parts.includes("mod")
		? !navigator.platform.toLowerCase().includes("mac")
		: parts.includes("ctrl");
	const expectsShift = parts.includes("shift");
	const expectsAlt = parts.includes("alt") || parts.includes("option");
	return (
		event.key.toLowerCase() === key &&
		event.metaKey === expectsMeta &&
		event.ctrlKey === expectsCtrl &&
		event.shiftKey === expectsShift &&
		event.altKey === expectsAlt
	);
}
