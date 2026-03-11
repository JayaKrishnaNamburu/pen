import { describe, it, expect } from "vitest";
import { InputRuleEngine } from "../engine";
import { defaultBlockRules } from "../defaultRules";
import type { Editor, InputRule } from "@pen/types";

type InputRuleTestEditor = {
	getBlock(): {
		type: string;
		textContent(): string;
	};
	selection:
		| {
				type: "text";
				anchor: { blockId: string; offset: number };
				focus: { blockId: string; offset: number };
				isCollapsed: boolean;
		  }
		| null;
	schema: {
		resolve(): {
			content: "inline";
			fieldEditor: "richtext" | "code";
		};
		resolveInline(): { kind: "mark" } | null;
	};
};

function mockEditor(opts: {
	blockType: string;
	textContent: string;
	cursorOffset?: number;
}) {
	const offset = opts.cursorOffset ?? opts.textContent.length;
	const editor = {
		getBlock: () => ({
			type: opts.blockType,
			textContent: () => opts.textContent,
		}),
		selection: {
			type: "text" as const,
			anchor: { blockId: "b1", offset },
			focus: { blockId: "b1", offset },
			isCollapsed: true,
		},
		schema: {
			resolve: () => ({
				content: "inline",
				fieldEditor: "richtext",
			}),
			resolveInline: () => ({ kind: "mark" }),
		},
	} satisfies InputRuleTestEditor;

	return editor as unknown as Editor;
}

function mockEditorWithSelection(opts: {
	blockType: string;
	textContent: string;
	anchorOffset: number;
	focusOffset: number;
}) {
	const editor = {
		getBlock: () => ({
			type: opts.blockType,
			textContent: () => opts.textContent,
		}),
		selection: {
			type: "text" as const,
			anchor: { blockId: "b1", offset: opts.anchorOffset },
			focus: { blockId: "b1", offset: opts.focusOffset },
			isCollapsed: opts.anchorOffset === opts.focusOffset,
		},
		schema: {
			resolve: () => ({
				content: "inline",
				fieldEditor: "richtext",
			}),
			resolveInline: () => ({ kind: "mark" }),
		},
	} satisfies InputRuleTestEditor;

	return editor as unknown as Editor;
}

function engineWithDefaults() {
	const engine = new InputRuleEngine();
	for (const rule of defaultBlockRules) engine.register(rule);
	return engine;
}

describe("InputRuleEngine", () => {
	describe("register / unregister", () => {
		it("registers and deduplicates by id", () => {
			const engine = new InputRuleEngine();
			const rule: InputRule = {
				id: "test",
				match: /^# $/,
				handler: () => null,
			};
			engine.register(rule);
			engine.register(rule);

			const editor = mockEditor({
				blockType: "paragraph",
				textContent: "",
			});
			const result = engine.tryMatch(editor, "b1", " ");
			expect(result).toBeNull();
		});

		it("unregister removes rule", () => {
			const engine = new InputRuleEngine();
			engine.register({
				id: "test",
				match: /^# $/,
				handler: (_m, ctx) => [
					{
						type: "convert-block",
						blockId: ctx.blockId,
						newType: "heading",
						newProps: { level: 1 },
					},
				],
			});

			engine.unregister("test");

			const editor = mockEditor({
				blockType: "paragraph",
				textContent: "#",
			});
			const result = engine.tryMatch(editor, "b1", " ");
			expect(result).toBeNull();
		});
	});

	describe("tryMatch — block rules", () => {
		it("returns null for non-trigger characters", () => {
			const engine = engineWithDefaults();
			const editor = mockEditor({
				blockType: "paragraph",
				textContent: "#",
			});
			const result = engine.tryMatch(editor, "b1", "a");
			expect(result).toBeNull();
		});

		it("matches heading-1 on '# '", () => {
			const engine = engineWithDefaults();
			const editor = mockEditor({
				blockType: "paragraph",
				textContent: "#",
			});
			const result = engine.tryMatch(editor, "b1", " ");

			expect(result).not.toBeNull();
			expect(result).toHaveLength(2);
			expect(result![0]).toMatchObject({
				type: "delete-text",
				blockId: "b1",
				offset: 0,
				length: 2,
			});
			expect(result![1]).toMatchObject({
				type: "convert-block",
				blockId: "b1",
				newType: "heading",
				newProps: { level: 1 },
			});
		});

		it("matches heading-3 on '### '", () => {
			const engine = engineWithDefaults();
			const editor = mockEditor({
				blockType: "paragraph",
				textContent: "###",
			});
			const result = engine.tryMatch(editor, "b1", " ");

			expect(result).not.toBeNull();
			expect(result![1]).toMatchObject({
				type: "convert-block",
				newType: "heading",
				newProps: { level: 3 },
			});
		});

		it("matches bullet list on '- '", () => {
			const engine = engineWithDefaults();
			const editor = mockEditor({
				blockType: "paragraph",
				textContent: "-",
			});
			const result = engine.tryMatch(editor, "b1", " ");

			expect(result).not.toBeNull();
			expect(result![1]).toMatchObject({
				type: "convert-block",
				newType: "bulletListItem",
			});
		});

		it("matches bullet list on '* '", () => {
			const engine = engineWithDefaults();
			const editor = mockEditor({
				blockType: "paragraph",
				textContent: "*",
			});
			const result = engine.tryMatch(editor, "b1", " ");

			expect(result).not.toBeNull();
			expect(result![1]).toMatchObject({
				type: "convert-block",
				newType: "bulletListItem",
			});
		});

		it("matches ordered list on '1. '", () => {
			const engine = engineWithDefaults();
			const editor = mockEditor({
				blockType: "paragraph",
				textContent: "1.",
			});
			const result = engine.tryMatch(editor, "b1", " ");

			expect(result).not.toBeNull();
			expect(result![1]).toMatchObject({
				type: "convert-block",
				newType: "numberedListItem",
			});
		});

		it("matches ordered list with start > 1", () => {
			const engine = engineWithDefaults();
			const editor = mockEditor({
				blockType: "paragraph",
				textContent: "5.",
			});
			const result = engine.tryMatch(editor, "b1", " ");

			expect(result).not.toBeNull();
			expect(result![1]).toMatchObject({
				type: "convert-block",
				newType: "numberedListItem",
				newProps: { start: 5 },
			});
		});

		it("matches unchecked todo on '[ ] '", () => {
			const engine = engineWithDefaults();
			const editor = mockEditor({
				blockType: "paragraph",
				textContent: "[ ]",
			});
			const result = engine.tryMatch(editor, "b1", " ");

			expect(result).not.toBeNull();
			expect(result![1]).toMatchObject({
				type: "convert-block",
				newType: "checkListItem",
				newProps: { checked: false },
			});
		});

		it("matches checked todo on '[x] '", () => {
			const engine = engineWithDefaults();
			const editor = mockEditor({
				blockType: "paragraph",
				textContent: "[x]",
			});
			const result = engine.tryMatch(editor, "b1", " ");

			expect(result).not.toBeNull();
			expect(result![1]).toMatchObject({
				type: "convert-block",
				newType: "checkListItem",
				newProps: { checked: true },
			});
		});

		it("matches blockquote on '> '", () => {
			const engine = engineWithDefaults();
			const editor = mockEditor({
				blockType: "paragraph",
				textContent: ">",
			});
			const result = engine.tryMatch(editor, "b1", " ");

			expect(result).not.toBeNull();
			expect(result![1]).toMatchObject({
				type: "convert-block",
				newType: "blockquote",
			});
		});

		it("matches code block on '``` '", () => {
			const engine = engineWithDefaults();
			const editor = mockEditor({
				blockType: "paragraph",
				textContent: "```",
			});
			const result = engine.tryMatch(editor, "b1", " ");

			expect(result).not.toBeNull();
			expect(result![1]).toMatchObject({
				type: "convert-block",
				newType: "codeBlock",
			});
		});

		it("matches divider on '--- '", () => {
			const engine = engineWithDefaults();
			const editor = mockEditor({
				blockType: "paragraph",
				textContent: "---",
			});
			const result = engine.tryMatch(editor, "b1", " ");

			expect(result).not.toBeNull();
			expect(result![1]).toMatchObject({
				type: "convert-block",
				newType: "divider",
			});
		});

		it("matches divider on '*** '", () => {
			const engine = engineWithDefaults();
			const editor = mockEditor({
				blockType: "paragraph",
				textContent: "***",
			});
			const result = engine.tryMatch(editor, "b1", " ");

			expect(result).not.toBeNull();
			expect(result![1]).toMatchObject({
				type: "convert-block",
				newType: "divider",
			});
		});

		it("matches callout on '> [!note] '", () => {
			const engine = engineWithDefaults();
			const editor = mockEditor({
				blockType: "paragraph",
				textContent: "> [!note]",
			});
			const result = engine.tryMatch(editor, "b1", " ");

			expect(result).not.toBeNull();
			expect(result![1]).toMatchObject({
				type: "convert-block",
				newType: "callout",
				newProps: { type: "note" },
			});
		});

		it("matches callout on '> [!WARNING] ' (case insensitive)", () => {
			const engine = engineWithDefaults();
			const editor = mockEditor({
				blockType: "paragraph",
				textContent: "> [!WARNING]",
			});
			const result = engine.tryMatch(editor, "b1", " ");

			expect(result).not.toBeNull();
			expect(result![1]).toMatchObject({
				type: "convert-block",
				newType: "callout",
				newProps: { type: "warning" },
			});
		});

		it("skips non-paragraph blocks", () => {
			const engine = engineWithDefaults();
			const editor = mockEditor({
				blockType: "heading",
				textContent: "#",
			});
			const result = engine.tryMatch(editor, "b1", " ");
			expect(result).toBeNull();
		});

		it("does not match partial patterns", () => {
			const engine = engineWithDefaults();
			const editor = mockEditor({
				blockType: "paragraph",
				textContent: "hello #",
			});
			const result = engine.tryMatch(editor, "b1", " ");
			expect(result).toBeNull();
		});

		it("skips when selection is not collapsed", () => {
			const engine = engineWithDefaults();
			const editor = mockEditorWithSelection({
				blockType: "paragraph",
				textContent: "#",
				anchorOffset: 0,
				focusOffset: 1,
			});
			const result = engine.tryMatch(editor, "b1", " ");
			expect(result).toBeNull();
		});

		it("skips when no selection", () => {
			const engine = engineWithDefaults();
			const editor = {
				...mockEditor({ blockType: "paragraph", textContent: "#" }),
				selection: null,
			};
			const result = engine.tryMatch(editor as unknown as Editor, "b1", " ");
			expect(result).toBeNull();
		});
	});

	describe("tryMatchInline", () => {
		it("skips inline rules for code field editors", () => {
			const engine = new InputRuleEngine();
			engine.registerInline({
				id: "bold",
				trigger: "*",
				pattern: /\*\*(.+)\*\*$/,
				markType: "bold",
			});

			const editor = {
				getBlock: () => ({
					type: "codeBlock",
					textContent: () => "**bold*",
				}),
				selection: {
					type: "text" as const,
					anchor: { blockId: "b1", offset: 7 },
					focus: { blockId: "b1", offset: 7 },
					isCollapsed: true,
				},
				schema: {
					resolve: () => ({
						content: "inline",
						fieldEditor: "code",
					}),
					resolveInline: () => ({ kind: "mark" }),
				},
			} satisfies InputRuleTestEditor;

			expect(engine.tryMatchInline(editor as unknown as Editor, "b1", "*")).toBeNull();
		});
	});
});
