import { sortDeltaAttributes } from "@input/pen-core";
import {
	FIELD_EDITOR_SLOT_KEY,
	type Editor,
	type InlineDecoration,
	type SchemaRegistry,
} from "@input/pen-types";
import { urlPolicyFromEditor } from "../security/resolveEditorUrl";
import type { UrlPolicy } from "../security/urlPolicy";
import type { FieldEditorDelta, FieldEditorTextLike } from "./crdt";
import { restoreSelection, saveSelection } from "./reconcilerSelection";
import {
	applyInlineDecorationsToDeltas,
	filterVisibleInlineDecorationDeltas,
} from "../utils/inlineDecorations";
import { createEmptyBlockPlaceholder } from "./emptyBlockPlaceholder";
import { createInlineAtomElement } from "./inlineAtomDom";
import { wrapWithMarks } from "./reconcilerMarks";
import { patchDOM } from "./reconcilerPatch";

type ReconcilePolicyOptions =
	| { editor: Editor; urlPolicy?: undefined }
	| { urlPolicy: UrlPolicy; editor?: undefined };

type DivergenceProjector = {
	isAdmissibleGestureRead?: () => boolean;
	requestDivergenceProjection?: () => void;
};

function requestUnwindowedProjection(editor: Editor): void {
	const fieldEditor = editor.internals.getSlot<DivergenceProjector>(
		FIELD_EDITOR_SLOT_KEY,
	);
	if (!fieldEditor || fieldEditor.isAdmissibleGestureRead?.()) {
		return;
	}
	queueMicrotask(() => {
		if (fieldEditor.isAdmissibleGestureRead?.()) {
			return;
		}
		fieldEditor.requestDivergenceProjection?.();
	});
}

export function fullReconcileToDOM(
	ytext: FieldEditorTextLike,
	element: HTMLElement,
	registry: SchemaRegistry,
	options: ReconcilePolicyOptions & {
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
		options.inlineDecorations && options.inlineDecorations.length > 0
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
	options: ReconcilePolicyOptions & { preserveSelection?: boolean },
): void {
	const policy =
		options.editor !== undefined
			? urlPolicyFromEditor(options.editor)
			: options.urlPolicy;
	const orderedDeltas = deltas.map((delta) => {
		if (!delta.attributes || Object.keys(delta.attributes).length < 2) {
			return delta;
		}
		return {
			...delta,
			attributes: sortDeltaAttributes(delta.attributes, registry),
		};
	});

	const preserveSelection = options.preserveSelection ?? true;
	const savedSelection = preserveSelection ? saveSelection(element) : null;

	const fragment = document.createDocumentFragment();
	let hasContent = false;
	for (const delta of orderedDeltas) {
		if (delta.insert == null) continue;
		if (typeof delta.insert === "string" && delta.insert.length === 0) {
			continue;
		}
		hasContent = true;
		let node: Node =
			typeof delta.insert === "string"
				? document.createTextNode(delta.insert)
				: createInlineAtomElement(delta.insert, registry);
		if (delta.attributes) {
			node = wrapWithMarks(node, delta.attributes, registry, policy);
		}
		fragment.appendChild(node);
	}
	if (!hasContent) {
		fragment.appendChild(createEmptyBlockPlaceholder());
	}

	patchDOM(element, fragment);
	if (savedSelection) {
		restoreSelection(element, savedSelection);
	}
	if (!preserveSelection && options.editor) {
		requestUnwindowedProjection(options.editor);
	}
}
