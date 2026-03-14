import React from "react";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import {
	AIContextualPromptComposer,
	AIContextualPromptSurface,
	type ContextualPromptMode,
	type ContextualPromptSide,
} from "./contextualPrompt";

export interface AIInlineSessionProps extends AsChildProps {
	placeholder?: string;
	autoFocus?: boolean;
	mode?: ContextualPromptMode;
	side?: ContextualPromptSide;
	sideOffset?: number;
	containerRef?: React.RefObject<HTMLElement | null>;
	ref?: React.Ref<HTMLElement>;
}

export function AIInlineSession(props: AIInlineSessionProps) {
	const {
		placeholder = "Edit selection",
		autoFocus = true,
		mode = "floating",
		side = "bottom",
		sideOffset = 8,
		containerRef,
		ref,
		...rest
	} = props;

	const defaultChildren = (
		<AIContextualPromptComposer
			autoFocus={autoFocus}
			placeholder={placeholder}
		/>
	);
	const surfaceChild =
		props.asChild && React.isValidElement(props.children)
			? React.cloneElement(
				props.children as React.ReactElement<{ children?: React.ReactNode }>,
				{},
				(props.children as React.ReactElement<{ children?: React.ReactNode }>).props
					.children ?? defaultChildren,
			)
			: props.children ?? defaultChildren;

	return (
		<AIContextualPromptSurface
			{...rest}
			asChild={props.asChild}
			containerRef={containerRef}
			mode={mode}
			ref={ref}
			side={side}
			sideOffset={sideOffset}
		>
			{surfaceChild}
		</AIContextualPromptSurface>
	);
}

export interface AIInlineSessionActionsProps extends AsChildProps {
	sessionId?: string;
	isRunning?: boolean;
	hasPendingChanges?: boolean;
	onAccept?: () => void;
	onReject?: () => void;
	onClose?: () => void;
	ref?: React.Ref<HTMLElement>;
}

export function AIInlineSessionActions(props: AIInlineSessionActionsProps) {
	const {
		sessionId,
		isRunning = false,
		hasPendingChanges = false,
		onAccept,
		onReject,
		onClose,
		ref,
		...rest
	} = props;

	function handlePointerDown(event: React.PointerEvent) {
		event.preventDefault();
	}

	const defaultChildren = (
		<>
			<button
				type="button"
				data-pen-ai-inline-session-accept=""
				onPointerDown={handlePointerDown}
				onClick={onAccept}
				disabled={!hasPendingChanges || isRunning}
			>
				Keep
			</button>
			<button
				type="button"
				data-pen-ai-inline-session-reject=""
				onPointerDown={handlePointerDown}
				onClick={onReject}
				disabled={!hasPendingChanges && isRunning}
			>
				Undo
			</button>
			<button
				type="button"
				data-pen-ai-inline-session-close=""
				onPointerDown={handlePointerDown}
				onClick={onClose}
			>
				Close
			</button>
		</>
	);

	return renderAsChild(
		{
			...rest,
			ref,
			children: props.children ?? defaultChildren,
		},
		"div",
		{
			"data-pen-ai-inline-session-actions": "",
			"data-session-id": sessionId,
		},
	);
}
