import {
	createDecorationSet,
	createEditor,
	decorationsFacet,
	defineExtension,
} from "@input/pen-core";
import { deltaStreamExtension } from "../stream";
import { documentOpsExtension } from "@input/pen-document-ops";
import { defaultSchema } from "@input/pen-schema-default";
import type {
	Decoration,
	DocumentState,
	Editor,
	Extension,
	InlineDecoration,
} from "@input/pen-types";
import { undoExtension } from "@input/pen-undo";
import { describe, expect, it } from "vitest";
import { aiExtension } from "../index";

type DecorationCall = {
	readonly state: DocumentState;
	readonly editor: Editor;
};

function instrumentDecorations(extension: Extension): DecorationCall[] {
	const original = extension.decorations;
	if (!original) {
		throw new Error("expected the v1 decorations field");
	}
	const calls: DecorationCall[] = [];
	extension.decorations = (state, editor) => {
		calls.push({ state, editor });
		return original(state, editor);
	};
	return calls;
}

function markerExtension(name: string, className: string): Extension {
	return defineExtension({
		name,
		decorations: (_state, editor) => {
			const blockId = editor.firstBlock()?.id;
			if (!blockId) {
				return createDecorationSet([]);
			}
			return createDecorationSet([
				{
					type: "inline",
					blockId,
					from: 0,
					to: 1,
					attributes: { class: className },
				},
			]);
		},
	});
}

function inlineClasses(decorations: readonly Decoration[]): string[] {
	return decorations
		.filter(
			(decoration): decoration is InlineDecoration =>
				decoration.type === "inline",
		)
		.map((decoration) => String(decoration.attributes.class ?? ""));
}

function insertHelloBlocks(editor: Editor, count: number): void {
	const firstBlockId = editor.firstBlock()!.id;
	const ops: Array<
		| {
				type: "insert-block";
				blockId: string;
				blockType: "paragraph";
				props: Record<string, never>;
				position: { after: string };
		  }
		| {
				type: "splice-text";
				blockId: string;
				from: number;
				to: number;
				insert: string;
		  }
	> = [
		{
			type: "splice-text",
			blockId: firstBlockId,
			from: 0,
				to: 0,
				insert: "hello 0",
		},
	];
	let previousId = firstBlockId;
	for (let index = 1; index < count; index += 1) {
		const blockId = `hello-${index}`;
		ops.push({
			type: "insert-block",
			blockId,
			blockType: "paragraph",
			props: {},
			position: { after: previousId },
		});
		ops.push({
			type: "splice-text",
			blockId,
			from: 0,
				to: 0,
				insert: `hello ${index}`,
		});
		previousId = blockId;
	}
	editor.apply(ops, { origin: "user" });
}

function createAIEditor(extension: Extension): Editor {
	return createEditor({
		schema: defaultSchema,
		extensions: [
			undoExtension(),
			deltaStreamExtension(),
			documentOpsExtension(),
			extension,
		],
	});
}

describe("ai decorations channel", () => {
	it("lifts the v1 decorations function onto decorationsFacet without wrapping it", () => {
		const extension = aiExtension();
		const editor = createAIEditor(extension);

		expect(extension.decorations).toBeTypeOf("function");
		expect(editor.facet(decorationsFacet)).toContain(extension.decorations);
		editor.destroy();
	});

	it("invokes the v1 decorations function with (documentState, editor)", () => {
		const extension = aiExtension();
		const calls = instrumentDecorations(extension);
		const editor = createAIEditor(extension);

		expect(calls.length).toBeGreaterThan(0);
		const first = calls[0];
		expect(first?.state).toBe(editor.documentState);
		expect(first?.editor).toBe(editor);
		editor.destroy();
	});

	it("invokes ai decorations once per commit, not once per block", () => {
		const extension = aiExtension();
		const calls = instrumentDecorations(extension);
		const editor = createAIEditor(extension);
		const afterInit = calls.length;
		const blockCount = 8;

		insertHelloBlocks(editor, blockCount);

		// observe() requests a second refresh on top of the commit-path collect
		expect(calls.length - afterInit).toBe(2);
		expect(calls.length - afterInit).not.toBe(blockCount);
		editor.destroy();
	});

	it("merges v1 decorations in extension registration order", () => {
		const ai = aiExtension();
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				markerExtension("probe-before", "probe-before"),
				ai,
				markerExtension("probe-after", "probe-after"),
			],
		});
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[
				{
					type: "splice-text",
					blockId,
					from: 0,
				to: 0,
				insert: "h",
				},
			],
			{ origin: "user" },
		);

		const classes = inlineClasses(
			editor.getDecorations().forBlock(blockId),
		);
		expect(classes[0]).toBe("probe-before");
		expect(classes[classes.length - 1]).toBe("probe-after");
		editor.destroy();
	});

	it("does not collect a decorationsFacet-only sibling into getDecorations()", () => {
		const ai = aiExtension();
		const facetOnly = defineExtension({
			name: "facet-only-probe",
			facets: [
				decorationsFacet.of((_state, editor) => {
					const blockId = editor.firstBlock()?.id;
					if (!blockId) {
						return createDecorationSet([]);
					}
					return createDecorationSet([
						{
							type: "inline",
							blockId,
							from: 0,
							to: 1,
							attributes: { class: "facet-only-probe" },
						},
					]);
				}),
			],
		});
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				ai,
				facetOnly,
			],
		});

		const classes = inlineClasses(editor.getDecorations().decorations);
		expect(classes).not.toContain("facet-only-probe");
		expect(editor.facet(decorationsFacet).length).toBeGreaterThan(1);
		editor.destroy();
	});

	it("places the v1-lifted provider before a native decorationsFacet.of() in the facet list", () => {
		const ai = aiExtension();
		const nativeSource = () => createDecorationSet([]);
		const native = defineExtension({
			name: "native-deco",
			facets: [decorationsFacet.of(nativeSource)],
		});
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				native,
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				ai,
			],
		});

		expect(editor.facet(decorationsFacet)[0]).toBe(ai.decorations);
		expect(editor.facet(decorationsFacet)).toContain(nativeSource);
		editor.destroy();
	});
});
