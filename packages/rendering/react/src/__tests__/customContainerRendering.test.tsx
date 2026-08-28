// @vitest-environment jsdom

import { act, type ReactElement, type Ref } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import {
	createEditor,
	defineBlock,
	mergeSchemas,
	prop,
	SchemaRegistryImpl,
	shouldRenderContainerChildren,
} from "@input/pen-core";
import type {
	BlockHandle,
	BlockRenderContext,
	BlockSchema,
} from "@input/pen-types";
import { defaultPreset } from "@input/pen";
import { defaultSchema } from "@input/pen-schema";
import { Pen } from "../primitives/index";
import { useEditorContext } from "../context/editorContext";
import { BlockChildren } from "../primitives/editor/blockChildren";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A host-defined container, standing in for a real one (Input's quoted email
 * history). It is not `toggle`, `callout`, or `blockquote`, which is the whole
 * point: container behavior must follow from the schema.
 */
const emailQuote = defineBlock("emailQuote", {
	content: "inline",
	isContainer: true,
	props: {
		open: prop.boolean().default(true),
		parentId: prop.string().optional(),
	},
});

const schema = mergeSchemas(
	defaultSchema,
	new SchemaRegistryImpl({
		blocks: [emailQuote as unknown as BlockSchema],
		inlines: [],
	}),
);

/**
 * Collapsing is the renderer's decision, matching the built-in `toggle`:
 * `BlockChildren` renders whatever children exist, and the renderer decides
 * whether to mount it. `shouldRenderContainerChildren` is the shared predicate
 * so a host renderer stays consistent with DOM navigation.
 */
function EmailQuoteRenderer(
	block: BlockHandle,
	ctx: BlockRenderContext,
): ReactElement {
	const { editor } = useEditorContext();

	return (
		<div
			ref={ctx.ref as Ref<HTMLDivElement>}
			data-testid={`quote-${block.id}`}
			data-block-type="emailQuote"
		>
			<Pen.Editor.InlineContent
				blockId={block.id}
				decorations={ctx.decorations}
			/>
			{shouldRenderContainerChildren(editor, block) ? (
				<BlockChildren
					parentBlockId={block.id}
					containerProps={{
						"data-testid": `quote-children-${block.id}`,
					}}
				/>
			) : null}
		</div>
	);
}

function createQuoteEditor() {
	return createEditor({
		schema,
		preset: defaultPreset({
			tools: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

async function mountEditor(
	editor: ReturnType<typeof createQuoteEditor>,
): Promise<{ container: HTMLElement; unmount: () => void }> {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<Pen.Editor.Root
				editor={editor}
				renderers={{ emailQuote: EmailQuoteRenderer }}
			>
				<Pen.Editor.Content />
			</Pen.Editor.Root>,
		);
	});

	return {
		container,
		unmount: () => {
			act(() => root.unmount());
			container.remove();
		},
	};
}

describe("custom container rendering", () => {
	it("renders children of a host-defined container written to the children array", async () => {
		const editor = createQuoteEditor();
		const quoteId = crypto.randomUUID();
		const childId = crypto.randomUUID();

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: quoteId,
					blockType: "emailQuote",
					props: {},
					position: "last",
				},
				{
					type: "insert-block",
					blockId: childId,
					blockType: "paragraph",
					props: {},
					position: { parent: quoteId, index: 0 },
				},
				{
					type: "splice-text",
					blockId: childId,
					from: 0,
					to: 0,
					insert: "quoted line",
				},
			],
			{ origin: "user" },
		);

		const { container, unmount } = await mountEditor(editor);

		try {
			const childrenHost = container.querySelector(
				`[data-testid="quote-children-${quoteId}"]`,
			);
			expect(childrenHost).not.toBeNull();
			expect(childrenHost?.textContent).toContain("quoted line");
		} finally {
			unmount();
		}
	});

	it("renders children of a host-defined container written through parentId", async () => {
		const editor = createQuoteEditor();
		const quoteId = crypto.randomUUID();
		const childId = crypto.randomUUID();

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: quoteId,
					blockType: "emailQuote",
					props: {},
					position: "last",
				},
				{
					type: "insert-block",
					blockId: childId,
					blockType: "paragraph",
					props: { parentId: quoteId },
					position: { after: quoteId },
				},
				{
					type: "splice-text",
					blockId: childId,
					from: 0,
					to: 0,
					insert: "sibling child",
				},
			],
			{ origin: "user" },
		);

		const { container, unmount } = await mountEditor(editor);

		try {
			const childrenHost = container.querySelector(
				`[data-testid="quote-children-${quoteId}"]`,
			);
			expect(childrenHost).not.toBeNull();
			expect(childrenHost?.textContent).toContain("sibling child");
		} finally {
			unmount();
		}
	});

	it("lets the renderer collapse children through the shared predicate", async () => {
		const editor = createQuoteEditor();
		const quoteId = crypto.randomUUID();
		const childId = crypto.randomUUID();

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: quoteId,
					blockType: "emailQuote",
					props: { open: false },
					position: "last",
				},
				{
					type: "insert-block",
					blockId: childId,
					blockType: "paragraph",
					props: { parentId: quoteId },
					position: { after: quoteId },
				},
				{
					type: "splice-text",
					blockId: childId,
					from: 0,
					to: 0,
					insert: "hidden line",
				},
			],
			{ origin: "user" },
		);

		const { container, unmount } = await mountEditor(editor);

		try {
			expect(container.textContent).not.toContain("hidden line");
		} finally {
			unmount();
		}
	});
});
