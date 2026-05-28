import type { InlineDecoration, SchemaRegistry } from "@pen/types";
import { sortDeltaAttributes } from "@pen/core";
import type { FieldEditorDelta, FieldEditorTextLike } from "./crdt";
import { restoreSelection, saveSelection } from "./reconcilerSelection";
import {
	applyInlineDecorationsToDeltas,
	filterVisibleInlineDecorationDeltas,
} from "../utils/inlineDecorations";
import { createInlineAtomElement } from "./inlineAtomDom";
import { wrapWithMarks } from "./reconcilerMarks";
import { patchDOM } from "./reconcilerPatch";

export function fullReconcileToDOM(
	ytext: FieldEditorTextLike,
	element: HTMLElement,
	registry: SchemaRegistry,
	options?: {
		preserveSelection?: boolean;
		inlineDecorations?: readonly InlineDecoration[];
	},
): void {
	const textDeltas = ytext.toDelta().filter(
		(
			delta,
		): delta is FieldEditorDelta & {
			insert: string | Record<string, unknown>;
		} => delta.insert != null,
	);
	const renderedDeltas =
		options?.inlineDecorations && options.inlineDecorations.length > 0
			? filterVisibleInlineDecorationDeltas(
					applyInlineDecorationsToDeltas(
						textDeltas,
						options.inlineDecorations,
					),
				)
			: textDeltas;
	fullReconcileDeltasToDOM(renderedDeltas, element, registry, options);
}

export function fullReconcileDeltasToDOM(
	deltas: FieldEditorDelta[],
	element: HTMLElement,
	registry: SchemaRegistry,
	options?: { preserveSelection?: boolean },
): void {
	const orderedDeltas = deltas.map((delta) => {
		if (!delta.attributes || Object.keys(delta.attributes).length < 2) {
			return delta;
		}
		return {
			...delta,
			attributes: sortDeltaAttributes(delta.attributes, registry),
		};
	});

	const preserveSelection = options?.preserveSelection ?? true;
	const savedSelection = preserveSelection ? saveSelection(element) : null;

	const fragment = document.createDocumentFragment();
	for (const delta of orderedDeltas) {
		if (delta.insert == null) continue;
		let node: Node =
			typeof delta.insert === "string"
				? document.createTextNode(delta.insert)
				: createInlineAtomElement(delta.insert, registry);
		if (delta.attributes) {
			node = wrapWithMarks(node, delta.attributes, registry);
		}
		fragment.appendChild(node);
	}

	patchDOM(element, fragment);
	if (savedSelection) {
		restoreSelection(element, savedSelection);
	}
}
