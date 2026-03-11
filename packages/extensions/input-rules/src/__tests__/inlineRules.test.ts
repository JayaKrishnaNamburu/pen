import { describe, it, expect } from "vitest";
import { InputRuleEngine } from "../engine";
import { defaultInlineRules } from "../inlineRules";
import type { Editor } from "@pen/types";

type InlineRulesTestEditor = {
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
			content: "inline" | "none";
			fieldEditor: string;
		};
		resolveInline(): { kind: "mark" } | null;
	};
};

function mockEditor(opts: {
	textContent: string;
	cursorOffset?: number;
	blockType?: string;
	fieldEditor?: string;
	hasInlineMark?: boolean;
}) {
	const offset = opts.cursorOffset ?? opts.textContent.length;
	const editor = {
		getBlock: () => ({
			type: opts.blockType ?? "paragraph",
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
				fieldEditor: opts.fieldEditor ?? "richtext",
			}),
			resolveInline: () =>
				opts.hasInlineMark === false ? null : { kind: "mark" },
		},
	} satisfies InlineRulesTestEditor;

	return editor as unknown as Editor;
}

function engineWithInlineRules() {
	const engine = new InputRuleEngine();
	for (const rule of defaultInlineRules) engine.registerInline(rule);
	return engine;
}

describe("InputRuleEngine — inline rules", () => {
	describe("bold (**text**)", () => {
		it("matches **hello** when closing * is typed", () => {
			const engine = engineWithInlineRules();
			const editor = mockEditor({ textContent: "**hello*" });
			const result = engine.tryMatchInline(editor as unknown as Editor, "b1", "*");

			expect(result).not.toBeNull();
			expect(result).toHaveLength(2);
			expect(result![0]).toMatchObject({
				type: "delete-text",
				blockId: "b1",
				offset: 0,
				length: 9,
			});
			expect(result![1]).toMatchObject({
				type: "insert-text",
				blockId: "b1",
				offset: 0,
				text: "hello",
				marks: { bold: true },
			});
		});

		it("matches bold after other text: 'hey **world*' + '*'", () => {
			const engine = engineWithInlineRules();
			const editor = mockEditor({ textContent: "hey **world*" });
			const result = engine.tryMatchInline(editor as unknown as Editor, "b1", "*");

			expect(result).not.toBeNull();
			expect(result![0]).toMatchObject({
				type: "delete-text",
				offset: 4,
				length: 9,
			});
			expect(result![1]).toMatchObject({
				type: "insert-text",
				offset: 4,
				text: "world",
				marks: { bold: true },
			});
		});

		it("does not match with empty inner text '***' + '*'", () => {
			const engine = engineWithInlineRules();
			const editor = mockEditor({ textContent: "***" });
			const result = engine.tryMatchInline(editor as unknown as Editor, "b1", "*");
			expect(result).toBeNull();
		});
	});

	describe("italic (*text*)", () => {
		it("matches *hello* when closing * is typed", () => {
			const engine = engineWithInlineRules();
			const editor = mockEditor({ textContent: "*hello" });
			const result = engine.tryMatchInline(editor, "b1", "*");

			expect(result).not.toBeNull();
			expect(result![0]).toMatchObject({
				type: "delete-text",
				offset: 0,
				length: 7,
			});
			expect(result![1]).toMatchObject({
				type: "insert-text",
				offset: 0,
				text: "hello",
				marks: { italic: true },
			});
		});

		it("matches italic after text: 'pre *word' + '*'", () => {
			const engine = engineWithInlineRules();
			const editor = mockEditor({ textContent: "pre *word" });
			const result = engine.tryMatchInline(editor, "b1", "*");

			expect(result).not.toBeNull();
			expect(result![1]).toMatchObject({
				text: "word",
				marks: { italic: true },
			});
		});
	});

	describe("code (`text`)", () => {
		it("matches `code` when closing backtick is typed", () => {
			const engine = engineWithInlineRules();
			const editor = mockEditor({ textContent: "`hello" });
			const result = engine.tryMatchInline(editor, "b1", "`");

			expect(result).not.toBeNull();
			expect(result![1]).toMatchObject({
				text: "hello",
				marks: { code: true },
			});
		});

		it("does not match empty backticks", () => {
			const engine = engineWithInlineRules();
			const editor = mockEditor({ textContent: "`" });
			const result = engine.tryMatchInline(editor, "b1", "`");
			expect(result).toBeNull();
		});
	});

	describe("strikethrough (~~text~~)", () => {
		it("matches ~~text~~ when closing ~ is typed", () => {
			const engine = engineWithInlineRules();
			const editor = mockEditor({ textContent: "~~hello~" });
			const result = engine.tryMatchInline(editor, "b1", "~");

			expect(result).not.toBeNull();
			expect(result![1]).toMatchObject({
				text: "hello",
				marks: { strikethrough: true },
			});
		});
	});

	describe("highlight (==text==)", () => {
		it("matches ==text== when closing = is typed", () => {
			const engine = engineWithInlineRules();
			const editor = mockEditor({ textContent: "==marked=" });
			const result = engine.tryMatchInline(editor, "b1", "=");

			expect(result).not.toBeNull();
			expect(result![1]).toMatchObject({
				text: "marked",
				marks: { highlight: true },
			});
		});
	});

	describe("edge cases", () => {
		it("returns null on non-matching trigger", () => {
			const engine = engineWithInlineRules();
			const editor = mockEditor({ textContent: "hello" });
			const result = engine.tryMatchInline(editor, "b1", "a");
			expect(result).toBeNull();
		});

		it("returns null for multi-character inserts", () => {
			const engine = engineWithInlineRules();
			const editor = mockEditor({ textContent: "**hello*" });
			const result = engine.tryMatchInline(editor, "b1", "**");
			expect(result).toBeNull();
		});

		it("returns null for code blocks (non-richtext field editor)", () => {
			const engine = engineWithInlineRules();
			const editor = mockEditor({
				textContent: "**hello*",
				fieldEditor: "code",
			});
			const result = engine.tryMatchInline(editor, "b1", "*");
			expect(result).toBeNull();
		});

		it("returns null for non-inline content blocks", () => {
			const engine = engineWithInlineRules();
			const editor = {
				...mockEditor({ textContent: "**hello*" }),
				schema: {
					resolve: () => ({ content: "none", fieldEditor: "none" }),
					resolveInline: () => ({ kind: "mark" }),
				},
			};
			const result = engine.tryMatchInline(editor as unknown as Editor, "b1", "*");
			expect(result).toBeNull();
		});

		it("returns null when mark type is not in schema", () => {
			const engine = engineWithInlineRules();
			const editor = mockEditor({
				textContent: "**hello*",
				hasInlineMark: false,
			});
			const result = engine.tryMatchInline(editor, "b1", "*");
			expect(result).toBeNull();
		});

		it("returns null when selection is not collapsed", () => {
			const engine = engineWithInlineRules();
			const editor = {
				...mockEditor({ textContent: "**hello*" }),
				selection: {
					type: "text" as const,
					anchor: { blockId: "b1", offset: 0 },
					focus: { blockId: "b1", offset: 5 },
					isCollapsed: false,
				},
			};
			const result = engine.tryMatchInline(editor as unknown as Editor, "b1", "*");
			expect(result).toBeNull();
		});

		it("returns null when no selection", () => {
			const engine = engineWithInlineRules();
			const editor = {
				...mockEditor({ textContent: "**hello*" }),
				selection: null,
			};
			const result = engine.tryMatchInline(editor as unknown as Editor, "b1", "*");
			expect(result).toBeNull();
		});

		it("bold takes priority over italic for ** patterns", () => {
			const engine = engineWithInlineRules();
			const editor = mockEditor({ textContent: "**word*" });
			const result = engine.tryMatchInline(editor, "b1", "*");

			expect(result).not.toBeNull();
			expect(result![1]).toMatchObject({
				marks: { bold: true },
			});
		});
	});
});
