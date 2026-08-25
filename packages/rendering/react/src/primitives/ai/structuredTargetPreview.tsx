import React from "react";
import type { GenerationStructuredPreviewState } from "@input/pen-ai";
import { useActiveAIStructuredPreview } from "../../hooks/useAIStructuredPreview";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useAIContext } from "./root";

export type StructuredPreviewTargetState =
	GenerationStructuredPreviewState["targets"][number];

export interface AIStructuredTargetPreviewProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AIStructuredTargetPreview(
	props: AIStructuredTargetPreviewProps,
) {
	const { editor } = useAIContext();
	const structuredPreview = useActiveAIStructuredPreview(editor);
	const targets = structuredPreview.preview?.targets ?? [];

	if (targets.length === 0) {
		return null;
	}

	const targetPreviewItems = targets.map((target) => (
		<AIStructuredTargetPreviewItem
			key={`${target.targetKind}:${target.blockId}`}
			target={target}
		/>
	));

	return renderAsChild(
		{
			...props,
			children: targetPreviewItems,
		},
		"div",
		{
			"data-pen-ai-structured-target-preview": "",
			"data-target-count": targets.length,
			"data-plan-state":
				structuredPreview.preview?.planState ?? undefined,
		},
	);
}

export function AIStructuredTargetPreviewItem(_props: {
	target: StructuredPreviewTargetState;
}) {
	return null;
}
