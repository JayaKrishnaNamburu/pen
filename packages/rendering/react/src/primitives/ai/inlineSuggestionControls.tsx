import React from "react";
import { createPortal } from "react-dom";
import { useInlineSuggestionControls } from "../../hooks/useInlineSuggestionControls";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { isDevelopmentEnvironment } from "../../utils/environment";
import { useAIContext } from "./root";

export interface AIInlineSuggestionControlsProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export interface AIInlineSuggestionFloatingSurfaceProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

interface InlineSuggestionControlsContextValue {
	controls: ReturnType<typeof useInlineSuggestionControls>;
}

const InlineSuggestionControlsContext =
	React.createContext<InlineSuggestionControlsContextValue | null>(null);

function useInlineSuggestionControlsContext(): InlineSuggestionControlsContextValue {
	const ctx = React.useContext(InlineSuggestionControlsContext);
	if (!ctx) {
		if (isDevelopmentEnvironment()) {
			console.error(
				"Pen: inline suggestion primitives must be used within <Pen.AI.InlineSuggestionControls>.",
			);
		}
		throw new Error("Missing Pen.AI.InlineSuggestionControls context");
	}
	return ctx;
}

export function AIInlineSuggestionControls(
	props: AIInlineSuggestionControlsProps,
) {
	const { editor } = useAIContext();
	const controls = useInlineSuggestionControls(editor);
	const { activePosition } = controls;

	const defaultChildren = controls.hasVisibleControls && activePosition
		? [
			<AIInlineSuggestionFloatingSurface
				key={activePosition.id}
			>
				<div data-pen-ai-inline-suggestion-nav="">
					<AIInlineSuggestionPreviousButton />
					<AIInlineSuggestionCount />
					<AIInlineSuggestionNextButton />
				</div>
				{controls.shouldUseRightEdgeRail ? null : (
					<>
						<AIInlineSuggestionRejectButton />
						<AIInlineSuggestionAcceptButton />
					</>
				)}
			</AIInlineSuggestionFloatingSurface>,
		]
		: [];

	return (
		<InlineSuggestionControlsContext.Provider value={{ controls }}>
			{renderAsChild(
				{
					...props,
					children: props.children ?? defaultChildren,
				},
				"div",
				{
					"data-pen-ai-inline-suggestion-controls": "",
					"data-visible-count": controls.visibleCount,
					"data-placement": activePosition?.placement,
					"data-has-active-suggestion": controls.hasVisibleControls ? "" : undefined,
				},
			)}
		</InlineSuggestionControlsContext.Provider>
	);
}

export function AIInlineSuggestionFloatingSurface(
	props: AIInlineSuggestionFloatingSurfaceProps,
) {
	const { controls } = useInlineSuggestionControlsContext();
	const { activePosition } = controls;
	if (!controls.hasVisibleControls || !activePosition) {
		return null;
	}

	const surface = renderAsChild(
		props,
		"div",
		{
			"data-pen-ai-inline-suggestion-control": "",
			"data-suggestion-id": activePosition.id,
			"data-suggestion-action": activePosition.action,
			"data-placement": activePosition.placement,
			"data-pen-ignore-pointer-gesture": "",
			style: {
				position: "absolute",
				top: `${Math.round(activePosition.top)}px`,
				left: `${Math.round(activePosition.left)}px`,
				zIndex: 55,
			},
		},
	);
	return createPortal(surface, activePosition.host);
}

export interface AIInlineSuggestionCountProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AIInlineSuggestionCount(props: AIInlineSuggestionCountProps) {
	const { controls } = useInlineSuggestionControlsContext();
	return renderAsChild(
		{
			...props,
			children:
				props.children ??
				`${controls.activeSuggestionNumber} of ${controls.visibleCount}`,
		},
		"span",
		{
			"data-pen-ai-inline-suggestion-count": "",
		},
	);
}

export interface AIInlineSuggestionPreviousButtonProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AIInlineSuggestionPreviousButton(
	props: AIInlineSuggestionPreviousButtonProps,
) {
	const { controls } = useInlineSuggestionControlsContext();
	const buttonProps: AsChildProps & {
		ref?: React.Ref<HTMLElement>;
	} & Record<string, unknown> = {
		...props,
		onMouseDown: preventEditorBlur,
		onClick: controls.goToPrevious,
		children: props.children ?? "\u2039",
	};
	return renderAsChild(
		buttonProps,
		"button",
		{
			type: "button",
			"data-pen-ai-inline-suggestion-prev": "",
			disabled: !controls.canGoToPrevious,
			"aria-label": "Previous suggestion",
		},
	);
}

export interface AIInlineSuggestionNextButtonProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AIInlineSuggestionNextButton(
	props: AIInlineSuggestionNextButtonProps,
) {
	const { controls } = useInlineSuggestionControlsContext();
	const buttonProps: AsChildProps & {
		ref?: React.Ref<HTMLElement>;
	} & Record<string, unknown> = {
		...props,
		onMouseDown: preventEditorBlur,
		onClick: controls.goToNext,
		children: props.children ?? "\u203a",
	};
	return renderAsChild(
		buttonProps,
		"button",
		{
			type: "button",
			"data-pen-ai-inline-suggestion-next": "",
			disabled: !controls.canGoToNext,
			"aria-label": "Next suggestion",
		},
	);
}

export interface AIInlineSuggestionAcceptButtonProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AIInlineSuggestionAcceptButton(
	props: AIInlineSuggestionAcceptButtonProps,
) {
	const { controls } = useInlineSuggestionControlsContext();
	const buttonProps: AsChildProps & {
		ref?: React.Ref<HTMLElement>;
	} & Record<string, unknown> = {
		...props,
		onMouseDown: preventEditorBlur,
		onClick: controls.acceptActiveSuggestionGroup,
		children: props.children ?? "Keep",
	};
	return renderAsChild(
		buttonProps,
		"button",
		{
			type: "button",
			"data-pen-ai-inline-suggestion-accept": "",
			disabled: !controls.hasVisibleControls,
		},
	);
}

export interface AIInlineSuggestionRejectButtonProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AIInlineSuggestionRejectButton(
	props: AIInlineSuggestionRejectButtonProps,
) {
	const { controls } = useInlineSuggestionControlsContext();
	const buttonProps: AsChildProps & {
		ref?: React.Ref<HTMLElement>;
	} & Record<string, unknown> = {
		...props,
		onMouseDown: preventEditorBlur,
		onClick: controls.rejectActiveSuggestionGroup,
		children: props.children ?? "Undo",
	};
	return renderAsChild(
		buttonProps,
		"button",
		{
			type: "button",
			"data-pen-ai-inline-suggestion-reject": "",
			disabled: !controls.hasVisibleControls,
		},
	);
}

function preventEditorBlur(event: React.MouseEvent<HTMLElement>) {
	event.preventDefault();
}
