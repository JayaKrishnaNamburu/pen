import React from "react";
import { createPortal } from "react-dom";
import { resolveEditorMessage } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import { useInlineSuggestionControls } from "../../hooks/useInlineSuggestionControls";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useAIContext } from "./root";

export interface AIInlineSuggestionControlsProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export interface AIInlineSuggestionFloatingSurfaceProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

interface InlineSuggestionControlsContextValue {
	editor: Editor;
	controls: ReturnType<typeof useInlineSuggestionControls>;
}

const InlineSuggestionControlsContext =
	React.createContext<InlineSuggestionControlsContextValue | null>(null);

function useInlineSuggestionControlsContext(): InlineSuggestionControlsContextValue {
	const ctx = React.useContext(InlineSuggestionControlsContext);
	if (!ctx) {
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

	const defaultChildren =
		controls.hasVisibleControls && activePosition
			? [
					<AIInlineSuggestionFloatingSurface key={activePosition.id}>
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
		<InlineSuggestionControlsContext.Provider value={{ editor, controls }}>
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
					"data-has-active-suggestion": controls.hasVisibleControls
						? ""
						: undefined,
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

	const surface = renderAsChild(props, "div", {
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
	});
	return createPortal(surface, activePosition.host);
}

export interface AIInlineSuggestionCountProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AIInlineSuggestionCount(props: AIInlineSuggestionCountProps) {
	const { controls, editor } = useInlineSuggestionControlsContext();
	return renderAsChild(
		{
			...props,
			children:
				props.children ??
				resolveEditorMessage(editor, "pen.ai.suggestion.count", {
					current: controls.activeSuggestionNumber,
					count: controls.visibleCount,
				}),
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
	const { controls, editor } = useInlineSuggestionControlsContext();
	const buttonProps: AsChildProps & {
		ref?: React.Ref<HTMLElement>;
	} & Record<string, unknown> = {
		...props,
		onMouseDown: preventEditorBlur,
		onClick: controls.goToPrevious,
		children: props.children ?? "\u2039",
	};
	return renderAsChild(buttonProps, "button", {
		type: "button",
		"data-pen-ai-inline-suggestion-prev": "",
		disabled: !controls.canGoToPrevious,
		"aria-label": resolveEditorMessage(
			editor,
			"pen.ai.suggestion.previous",
		),
	});
}

export interface AIInlineSuggestionNextButtonProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AIInlineSuggestionNextButton(
	props: AIInlineSuggestionNextButtonProps,
) {
	const { controls, editor } = useInlineSuggestionControlsContext();
	const buttonProps: AsChildProps & {
		ref?: React.Ref<HTMLElement>;
	} & Record<string, unknown> = {
		...props,
		onMouseDown: preventEditorBlur,
		onClick: controls.goToNext,
		children: props.children ?? "\u203a",
	};
	return renderAsChild(buttonProps, "button", {
		type: "button",
		"data-pen-ai-inline-suggestion-next": "",
		disabled: !controls.canGoToNext,
		"aria-label": resolveEditorMessage(editor, "pen.ai.suggestion.next"),
	});
}

export interface AIInlineSuggestionAcceptButtonProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AIInlineSuggestionAcceptButton(
	props: AIInlineSuggestionAcceptButtonProps,
) {
	const { controls, editor } = useInlineSuggestionControlsContext();
	const buttonProps: AsChildProps & {
		ref?: React.Ref<HTMLElement>;
	} & Record<string, unknown> = {
		...props,
		onMouseDown: preventEditorBlur,
		onClick: controls.acceptActiveSuggestionGroup,
		children:
			props.children ??
			resolveEditorMessage(editor, "pen.ai.suggestion.keep"),
	};
	return renderAsChild(buttonProps, "button", {
		type: "button",
		"data-pen-ai-inline-suggestion-accept": "",
		disabled: !controls.hasVisibleControls,
	});
}

export interface AIInlineSuggestionRejectButtonProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AIInlineSuggestionRejectButton(
	props: AIInlineSuggestionRejectButtonProps,
) {
	const { controls, editor } = useInlineSuggestionControlsContext();
	const buttonProps: AsChildProps & {
		ref?: React.Ref<HTMLElement>;
	} & Record<string, unknown> = {
		...props,
		onMouseDown: preventEditorBlur,
		onClick: controls.rejectActiveSuggestionGroup,
		children:
			props.children ??
			resolveEditorMessage(editor, "pen.ai.suggestion.undo"),
	};
	return renderAsChild(buttonProps, "button", {
		type: "button",
		"data-pen-ai-inline-suggestion-reject": "",
		disabled: !controls.hasVisibleControls,
	});
}

function preventEditorBlur(event: React.MouseEvent<HTMLElement>) {
	event.preventDefault();
}
