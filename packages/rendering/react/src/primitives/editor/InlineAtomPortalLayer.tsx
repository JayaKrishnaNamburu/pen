import React, { useLayoutEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { Editor, SelectionState } from "@pen/types";
import type {
	InlineAtomRenderers,
	ResolvedInlineAtomInteractions,
} from "../../context/editorContext";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import {
	attachInlineAtomWrapperInteractions,
	getInlineAtomDragSnapshot,
	getInlineAtomRenderInteractionProps,
	isInlineAtomDragSource,
	subscribeInlineAtomDragSnapshot,
} from "./inlineAtomInteraction";
import {
	isInlineAtomSelected,
	type InlineAtomRenderTarget,
} from "./inlineAtomTargets";

export function InlineAtomPortalLayer(props: {
	editor: Editor;
	blockId: string;
	targets: InlineAtomRenderTarget[];
	renderers?: InlineAtomRenderers;
	selection: SelectionState;
	interactions: ResolvedInlineAtomInteractions;
	readonly: boolean;
}) {
	const {
		editor,
		blockId,
		targets,
		renderers,
		selection,
		interactions,
		readonly,
	} = props;
	const inlineAtomDragSnapshot = useSyncExternalStore(
		subscribeInlineAtomDragSnapshot,
		getInlineAtomDragSnapshot,
		getInlineAtomDragSnapshot,
	);

	const inlineAtomPortals = targets.flatMap((target) => {
		const renderer = renderers?.[target.type];
		if (!renderer) {
			return [];
		}

		const selected = isInlineAtomSelected(
			selection,
			blockId,
			target.offset,
		);
		const dragging = isInlineAtomDragSource(
			inlineAtomDragSnapshot,
			editor,
			blockId,
			target.offset,
		);
		return [
			createPortal(
				renderer({
					blockId,
					offset: target.offset,
					type: target.type,
					props: target.props,
					text: target.text,
					selected,
					interaction: getInlineAtomRenderInteractionProps(
						{
							element: target.element,
							editor,
							blockId,
							offset: target.offset,
							type: target.type,
							text: target.text,
							props: target.props,
							selected,
							interactions,
							readonly,
						},
						dragging,
					),
				}),
				target.element,
				target.key,
			),
		];
	});

	useLayoutEffect(() => {
		targets.forEach((target) => {
			target.element.toggleAttribute(
				DATA_ATTRS.selected,
				isInlineAtomSelected(selection, blockId, target.offset),
			);
			target.element.toggleAttribute(
				DATA_ATTRS.inlineAtomDragging,
				isInlineAtomDragSource(
					inlineAtomDragSnapshot,
					editor,
					blockId,
					target.offset,
				),
			);
		});
	}, [blockId, editor, inlineAtomDragSnapshot, targets, selection]);

	useLayoutEffect(() => {
		const cleanups = targets.map((target) =>
			attachInlineAtomWrapperInteractions({
				element: target.element,
				editor,
				blockId,
				offset: target.offset,
				type: target.type,
				text: target.text,
				props: target.props,
				selected: isInlineAtomSelected(
					selection,
					blockId,
					target.offset,
				),
				interactions,
				readonly,
			}),
		);

		return () => {
			cleanups.forEach((cleanup) => cleanup());
		};
	}, [blockId, editor, interactions, targets, readonly, selection]);

	return <>{inlineAtomPortals}</>;
}
