import React from "react";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useAIContext } from "./root";

export interface AITriggerProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AITrigger(props: AITriggerProps) {
	const { controller, state } = useAIContext();
	const triggerProps: AsChildProps & {
		ref?: React.Ref<HTMLElement>;
	} & Record<string, unknown> = {
		...props,
		onClick: () => controller?.openCommandMenu(),
	};

	return renderAsChild(
		triggerProps,
		"button",
		{
			type: "button",
			"data-pen-ai-trigger": "",
			"data-open": state.commandMenuOpen ? "" : undefined,
		},
	);
}
