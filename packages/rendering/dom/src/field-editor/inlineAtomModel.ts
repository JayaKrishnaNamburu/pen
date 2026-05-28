import type {
	Editor,
	InlineDelta,
	InlineNodeDeltaInsert,
	SchemaRegistry,
} from "@pen/types";

export const INLINE_ATOM_LOGICAL_LENGTH = 1;
export const INLINE_ATOM_REPLACEMENT_TEXT = "\uFFFC";
export const INLINE_ATOM_CARET_BOUNDARY_TEXT = "\u200B";

const ZERO_WIDTH_SPACE = "\u200B";

export interface InlineAtomInsert {
	type: string;
	props: Record<string, unknown>;
}

export interface InlineAtomSnapshot extends InlineAtomInsert {
	blockId: string;
	offset: number;
	text: string;
}

export interface InlineAtomRange {
	start: number;
	end: number;
}

export function resolveInlineAtomInsert(
	insert: unknown,
): InlineAtomInsert | null {
	if (!insert || typeof insert !== "object") {
		return null;
	}

	const record = insert as Record<string, unknown>;
	const type = typeof record.type === "string" ? record.type : "";
	if (!type) {
		return null;
	}

	if (record.props && typeof record.props === "object") {
		return {
			type,
			props: record.props as Record<string, unknown>,
		};
	}

	const props: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(record)) {
		if (key !== "type") {
			props[key] = value;
		}
	}

	return { type, props };
}

export function resolveInlineAtomDisplayText(
	atom: InlineAtomInsert,
	registry: Pick<SchemaRegistry, "resolveInline">,
): string {
	const schemaText = registry
		.resolveInline(atom.type)
		?.serialize.toMarkdown?.("", atom.props);
	if (schemaText) {
		return schemaText;
	}

	const label = atom.props.label;
	if (typeof label === "string" && label.length > 0) {
		return label;
	}

	const name = atom.props.name;
	if (typeof name === "string" && name.length > 0) {
		return name;
	}

	const id = atom.props.id;
	if (typeof id === "string" && id.length > 0) {
		return id;
	}

	return atom.type;
}

export function getInlineDeltaLength(delta: InlineDelta): number {
	return typeof delta.insert === "string"
		? delta.insert
				.replaceAll(ZERO_WIDTH_SPACE, "")
				.replaceAll(INLINE_ATOM_REPLACEMENT_TEXT, "").length
		: INLINE_ATOM_LOGICAL_LENGTH;
}

export function getInlineAtomAtOffset(
	editor: Editor,
	source: { blockId: string; offset: number },
): InlineAtomSnapshot | null {
	const block = editor.getBlock(source.blockId);
	if (!block) {
		return null;
	}

	let offset = 0;
	for (const delta of block.inlineDeltas()) {
		const length = getInlineDeltaLength(delta);
		if (offset === source.offset && typeof delta.insert !== "string") {
			return {
				blockId: source.blockId,
				offset: source.offset,
				type: delta.insert.type,
				props: { ...delta.insert.props },
				text: resolveInlineAtomDisplayText(delta.insert, editor.schema),
			};
		}

		offset += length;
	}

	return null;
}

export function isInlineAtomRange(
	ytext: { toDelta(): Array<{ insert?: string | Record<string, unknown> }> },
	start: number,
	end: number,
): boolean {
	const atomRange = getInlineAtomRangeAtOffset(ytext, start);
	return atomRange?.end === end;
}

export function getInlineAtomRangeAtOffset(
	ytext: { toDelta(): Array<{ insert?: string | Record<string, unknown> }> },
	targetOffset: number,
): InlineAtomRange | null {
	if (targetOffset < 0) {
		return null;
	}

	let offset = 0;
	for (const delta of ytext.toDelta()) {
		if (delta.insert == null) {
			continue;
		}

		if (typeof delta.insert === "string") {
			offset += delta.insert.length;
			continue;
		}

		if (offset === targetOffset) {
			return {
				start: offset,
				end: offset + INLINE_ATOM_LOGICAL_LENGTH,
			};
		}
		offset += INLINE_ATOM_LOGICAL_LENGTH;
	}

	return null;
}

export function getInlineAtomInsertText(
	registry: Pick<SchemaRegistry, "resolveInline">,
	atom: InlineNodeDeltaInsert,
): string {
	return resolveInlineAtomDisplayText(atom, registry);
}
