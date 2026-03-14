import React from "react";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useAIContext } from "./root";

export interface AIActionBarProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AIActionBar(props: AIActionBarProps) {
	const { state } = useAIContext();
	const generation = state.activeGeneration;
	return renderAsChild(
		props,
		"div",
		{
			"data-pen-ai-actionBar": "",
			"data-status": generation?.status ?? "idle",
			hidden: generation == null,
		},
	);
}

export interface AIAcceptButtonProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AIAcceptButton(props: AIAcceptButtonProps) {
	const { controller, state } = useAIContext();
	const suggestionIds = state.activeGeneration?.suggestionIds ?? [];
	const hasPendingPlan = state.activeGeneration?.planState === "validated";
	const canAccept = suggestionIds.length > 0 || hasPendingPlan;
	function handleAcceptClick() {
		controller?.acceptActiveGeneration();
	}
	const buttonProps: AsChildProps & {
		ref?: React.Ref<HTMLElement>;
	} & Record<string, unknown> = {
		...props,
		onClick: handleAcceptClick,
	};
	return renderAsChild(
		buttonProps,
		"button",
		{
			type: "button",
			"data-pen-ai-accept": "",
			disabled: !canAccept,
		},
	);
}

export interface AIRejectButtonProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AIRejectButton(props: AIRejectButtonProps) {
	const { controller } = useAIContext();
	const buttonProps: AsChildProps & {
		ref?: React.Ref<HTMLElement>;
	} & Record<string, unknown> = {
		...props,
		onClick: () => controller?.rejectActiveGeneration(),
	};
	return renderAsChild(
		buttonProps,
		"button",
		{
			type: "button",
			"data-pen-ai-reject": "",
		},
	);
}

export interface AIRetryButtonProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AIRetryButton(props: AIRetryButtonProps) {
	const { controller } = useAIContext();
	const buttonProps: AsChildProps & {
		ref?: React.Ref<HTMLElement>;
	} & Record<string, unknown> = {
		...props,
		onClick: () => {
			void controller?.retryActiveGeneration();
		},
	};
	return renderAsChild(
		buttonProps,
		"button",
		{
			type: "button",
			"data-pen-ai-retry": "",
		},
	);
}
