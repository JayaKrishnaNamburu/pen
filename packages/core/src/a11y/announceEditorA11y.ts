import {
	isMessageKey,
	type A11yMessageKey,
	type Editor,
	type EditorAnnouncer,
	type MessageArgs,
	type MessageKey,
} from "@input/pen-types";

import { announcerFacet } from "../facets/controllerFacets";
import { resolveEditorMessage } from "../i18n/resolveEditorMessage";

export function announceEditorA11y<K extends A11yMessageKey>(
	editor: Editor,
	key: K,
	...args: MessageArgs<`pen.a11y.${K}` & MessageKey>
): void {
	const announcer =
		(editor.facet(announcerFacet) as EditorAnnouncer | null) ?? null;
	if (!announcer) {
		return;
	}
	const messageKey = `pen.a11y.${key}` as `pen.a11y.${K}` & MessageKey;
	const message = resolveEditorMessage(
		editor,
		messageKey,
		...(args as MessageArgs<typeof messageKey>),
	);
	if (message.length === 0) {
		return;
	}
	announcer.announce(message, "polite", key);
}

export function resolveA11yBlockTypeLabel(
	editor: Editor,
	type: string,
): string {
	const key = `pen.schema.${type}.title`;
	if (isMessageKey(key)) {
		const label = resolveEditorMessage(editor, key);
		if (label.length > 0) {
			return label;
		}
	}
	return type;
}
