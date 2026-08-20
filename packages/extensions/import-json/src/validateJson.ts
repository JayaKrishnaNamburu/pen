import type { PendingBlock } from "@input/pen-content-ops";
import {
	getFlowCapabilityFromSchema,
	getFlowCapabilityFromType,
	type Editor,
	type InlineSchema,
} from "@input/pen-types";
import {
	INGEST_MAX_IMAGE_COUNT,
	INGEST_MAX_NESTING_DEPTH,
	INGEST_MAX_NODE_COUNT,
	INGEST_MAX_TEXT_SIZE,
	copyRecord,
	createIngestReport,
	emptyRecord,
	IngestDropCounts,
	isRecord,
	type IngestReport,
} from "./ingestBounds";

export interface JsonIngestResult {
	readonly blocks: PendingBlock[];
	readonly report: IngestReport;
}

interface BoundState {
	nodes: number;
	text: number;
	images: number;
}

export function ingestJsonDocument(
	input: string | unknown,
	editor: Editor,
): JsonIngestResult {
	const drops = new IngestDropCounts();
	const value = typeof input === "string" ? JSON.parse(input) : input;

	if (!isRecord(value)) {
		throw new Error("Invalid Pen JSON document.");
	}

	const document = copyRecord(value, drops);
	if (document.version !== 1) {
		throw new Error("Unsupported Pen JSON document version.");
	}
	if (!Array.isArray(document.blocks)) {
		throw new Error("Invalid Pen JSON document: expected blocks array.");
	}

	const state: BoundState = { nodes: 0, text: 0, images: 0 };
	const droppedBlockTypes = new Set<string>();
	const blocks: PendingBlock[] = [];

	for (const raw of document.blocks) {
		const block = ingestBlock(raw, 1, editor, state, drops, droppedBlockTypes);
		if (block) {
			blocks.push(block);
		}
	}

	return {
		blocks,
		report: createIngestReport(
			document.blocks.length,
			blocks.length,
			[...droppedBlockTypes],
			drops,
		),
	};
}

function ingestBlock(
	raw: unknown,
	depth: number,
	editor: Editor,
	state: BoundState,
	drops: IngestDropCounts,
	droppedBlockTypes: Set<string>,
): PendingBlock | null {
	if (!isRecord(raw)) {
		drops.add("invalid-props");
		return null;
	}

	if (depth > INGEST_MAX_NESTING_DEPTH) {
		drops.add("depth-exceeded");
		return null;
	}

	if (state.nodes >= INGEST_MAX_NODE_COUNT) {
		drops.add("count-exceeded");
		return null;
	}

	const record = copyRecord(raw, drops);
	const type = record.type;
	if (typeof type !== "string" || type.length === 0) {
		drops.add("invalid-props");
		return null;
	}

	const isInternal = type.startsWith("__table");
	const registered = isInternal
		? false
		: editor.schema.allBlocks().some((block) => block.type === type);
	const schema = registered ? editor.schema.resolve(type) : null;
	if (!isInternal && !registered) {
		drops.add("unknown-block-type");
		droppedBlockTypes.add(type);
		return null;
	}

	if (!isInternal && editor.documentProfile === "flow") {
		const capability =
			getFlowCapabilityFromSchema(schema) ?? getFlowCapabilityFromType(type);
		if (capability === "flow-disallowed") {
			drops.add("profile-disallowed");
			droppedBlockTypes.add(type);
			return null;
		}
	}

	if (type === "image" && state.images >= INGEST_MAX_IMAGE_COUNT) {
		drops.add("image-count-exceeded");
		return null;
	}

	const rawProps = isRecord(record.props) ? record.props : emptyRecord();
	if (schema) {
		let unknownPropCount = 0;
		for (const key of Object.keys(rawProps)) {
			if (!(key in schema.propSchema)) {
				unknownPropCount += 1;
			}
		}
		if (unknownPropCount > 0) {
			drops.add("invalid-props", unknownPropCount);
		}
	}

	const validatedProps = schema?.validateProps
		? copyRecord(schema.validateProps(rawProps), new IngestDropCounts())
		: copyKnownProps(rawProps, schema?.propSchema);

	const content = ingestContent(record.content, editor, drops);
	if (state.text + content.textLength > INGEST_MAX_TEXT_SIZE) {
		drops.add("text-size-exceeded", content.textLength);
		return null;
	}

	state.nodes += 1;
	state.text += content.textLength;
	if (type === "image") {
		state.images += 1;
	}

	const children: PendingBlock[] = [];
	if (Array.isArray(record.children)) {
		for (const child of record.children) {
			const ingested = ingestBlock(
				child,
				depth + 1,
				editor,
				state,
				drops,
				droppedBlockTypes,
			);
			if (ingested) {
				children.push(ingested);
			}
		}
	}

	const block: PendingBlock = {
		type,
		props: validatedProps,
	};
	if (content.text !== undefined) {
		block.content = content.text;
	}
	if (content.marks) {
		block.marks = content.marks;
	}
	if (content.segments) {
		block.segments = content.segments;
	}
	if (children.length > 0) {
		block.children = children;
	}
	return block;
}

function ingestContent(
	raw: unknown,
	editor: Editor,
	drops: IngestDropCounts,
): {
	text?: string;
	marks?: PendingBlock["marks"];
	segments?: NonNullable<PendingBlock["segments"]>;
	textLength: number;
} {
	if (raw === undefined) {
		return { textLength: 0 };
	}
	if (typeof raw === "string") {
		return { text: raw, textLength: raw.length };
	}
	if (!isRecord(raw)) {
		drops.add("invalid-props");
		return { textLength: 0 };
	}

	const text = typeof raw.text === "string" ? raw.text : "";
	const marks = Array.isArray(raw.marks)
		? ingestMarks(raw.marks, editor, drops)
		: undefined;
	const segments = Array.isArray(raw.segments)
		? ingestSegments(raw.segments, editor, drops)
		: undefined;
	const textLength =
		segments && segments.length > 0
			? segments.reduce(
					(size, segment) =>
						size + (segment.type === "text" ? segment.text.length : 0),
					0,
				)
			: text.length;

	return { text, marks, segments, textLength };
}

function ingestMarks(
	rawMarks: unknown[],
	editor: Editor,
	drops: IngestDropCounts,
): NonNullable<PendingBlock["marks"]> {
	const marks: NonNullable<PendingBlock["marks"]> = [];

	for (const raw of rawMarks) {
		if (!isRecord(raw)) {
			drops.add("invalid-props");
			continue;
		}

		const mark = copyRecord(raw, drops);
		if (typeof mark.type !== "string") {
			drops.add("invalid-props");
			continue;
		}

		const inline = editor.schema.resolveInline(mark.type);
		if (!inline || inline.kind === "node") {
			drops.add("invalid-props");
			continue;
		}

		const props = isRecord(mark.props)
			? copyKnownInlineProps(mark.props, inline, drops)
			: undefined;
		const start = typeof mark.start === "number" ? mark.start : 0;
		const end = typeof mark.end === "number" ? mark.end : 0;
		marks.push({
			type: mark.type,
			start,
			end,
			...(props ? { props } : {}),
		});
	}

	return marks;
}

function ingestSegments(
	rawSegments: unknown[],
	editor: Editor,
	drops: IngestDropCounts,
): NonNullable<PendingBlock["segments"]> {
	const segments: NonNullable<PendingBlock["segments"]> = [];

	for (const raw of rawSegments) {
		if (!isRecord(raw)) {
			drops.add("invalid-props");
			continue;
		}

		const segment = copyRecord(raw, drops);
		if (segment.type === "text") {
			segments.push({
				type: "text",
				text: typeof segment.text === "string" ? segment.text : "",
				...(isRecord(segment.attributes)
					? { attributes: copyRecord(segment.attributes, drops) }
					: {}),
			});
			continue;
		}

		if (segment.type !== "node" || typeof segment.nodeType !== "string") {
			drops.add("invalid-props");
			continue;
		}

		const inline = editor.schema.resolveInline(segment.nodeType);
		if (!inline || inline.kind !== "node") {
			drops.add("invalid-props");
			continue;
		}

		const props = isRecord(segment.props)
			? copyKnownInlineProps(segment.props, inline, drops)
			: emptyRecord();
		segments.push({
			type: "node",
			nodeType: segment.nodeType,
			props,
		});
	}

	return segments;
}

function copyKnownProps(
	raw: Record<string, unknown>,
	propSchema: Record<string, unknown> | undefined,
): Record<string, unknown> {
	const record = emptyRecord();
	if (!propSchema) {
		for (const key of Object.keys(raw)) {
			record[key] = raw[key];
		}
		return record;
	}
	for (const key of Object.keys(propSchema)) {
		if (Object.hasOwn(raw, key)) {
			record[key] = raw[key];
		}
	}
	return record;
}

function copyKnownInlineProps(
	raw: Record<string, unknown>,
	inline: InlineSchema,
	drops: IngestDropCounts,
): Record<string, unknown> {
	let unknown = 0;
	for (const key of Object.keys(raw)) {
		if (!(key in inline.propSchema)) {
			unknown += 1;
		}
	}
	if (unknown > 0) {
		drops.add("invalid-props", unknown);
	}
	return copyKnownProps(raw, inline.propSchema);
}
