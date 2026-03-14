import React from "react";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useAIContext } from "./root";

export interface AIGenerationZoneProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AIGenerationZone(props: AIGenerationZoneProps) {
	const { state } = useAIContext();
	const generation = state.activeGeneration;

	return renderAsChild(
		props,
		"div",
		{
			"data-pen-ai-generationZone": "",
			"data-status": generation?.status ?? "idle",
			"data-streaming": generation?.status === "streaming" ? "" : undefined,
			"data-block-id": generation?.blockId ?? undefined,
		},
	);
}
