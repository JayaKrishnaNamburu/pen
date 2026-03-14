import React from "react";
import { useAIStructuredPreview } from "../../hooks/useAIStructuredPreview";
import { useAIStreamEvents } from "../../hooks/useAIStreamEvents";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useAIContext } from "./root";

export interface AIProgressProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AIProgress(props: AIProgressProps) {
	const { editor, state } = useAIContext();
	const generation = state.activeGeneration;
	const streamEvents = useAIStreamEvents(editor);
	const structuredPreview = useAIStructuredPreview(editor, generation);
	const lastStreamEvent = streamEvents[streamEvents.length - 1];
	const toolOutputCount = streamEvents.filter(
		(event) => event.type === "tool-output",
	).length;
	return renderAsChild(
		props,
		"div",
		{
			"data-pen-ai-progress": "",
			"data-status": state.status,
			"data-step-count": generation?.steps.length ?? 0,
			"data-stream-event-count": streamEvents.length,
			"data-last-stream-event": lastStreamEvent?.type ?? undefined,
			"data-tool-output-count": toolOutputCount,
			"data-structured-preview-count":
				structuredPreview.preview?.reviewItems.length ?? 0,
			"data-structured-preview-state":
				structuredPreview.preview?.planState ?? undefined,
			"data-structured-preview-patch-count": structuredPreview.patchCount,
		},
	);
}
