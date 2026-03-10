import { describe, expect, it } from "vitest";
import {
	paragraph,
	heading,
	bulletListItem,
	numberedListItem,
	checkListItem,
	codeBlock,
	image,
	table,
	divider,
	callout,
	toggle,
	blockquote,
	bold,
	italic,
	underline,
	strikethrough,
	highlight,
	textColor,
	backgroundColor,
	link,
	code,
	mention,
	inlineApp,
} from "../index";

// ── AC 11: All blocks have serialize.toMarkdown ───────────
describe("AC 11 — serialize.toMarkdown", () => {
	const allBlocks = [
		{ schema: paragraph, name: "paragraph" },
		{ schema: heading, name: "heading" },
		{ schema: bulletListItem, name: "bulletListItem" },
		{ schema: numberedListItem, name: "numberedListItem" },
		{ schema: checkListItem, name: "checkListItem" },
		{ schema: codeBlock, name: "codeBlock" },
		{ schema: image, name: "image" },
		{ schema: table, name: "table" },
		{ schema: divider, name: "divider" },
		{ schema: callout, name: "callout" },
		{ schema: toggle, name: "toggle" },
		{ schema: blockquote, name: "blockquote" },
	];

	for (const { schema, name } of allBlocks) {
		it(`${name} has serialize.toMarkdown defined`, () => {
			expect(schema.serialize?.toMarkdown).toBeDefined();
			expect(typeof schema.serialize?.toMarkdown).toBe("function");
		});

		it(`${name} has serialize.toHTML defined`, () => {
			expect(schema.serialize?.toHTML).toBeDefined();
			expect(typeof schema.serialize?.toHTML).toBe("function");
		});
	}
});

// ── AC 24: paragraph and heading serialization ────────────
describe("AC 24 — paragraph and heading serialization", () => {
	it("paragraph.serialize.toMarkdown returns plain text", () => {
		const block = {
			id: "1",
			type: "paragraph" as const,
			props: {},
			content: "Hello world",
		};
		expect(paragraph.serialize!.toMarkdown!(block)).toBe("Hello world");
	});

	it("heading.serialize.toMarkdown returns #-prefixed text", () => {
		const block = {
			id: "1",
			type: "heading" as const,
			props: { level: 1 },
			content: "Title",
		};
		expect(heading.serialize!.toMarkdown!(block)).toBe("# Title");
	});

	it("heading.serialize.toMarkdown with level 3", () => {
		const block = {
			id: "1",
			type: "heading" as const,
			props: { level: 3 },
			content: "Title",
		};
		expect(heading.serialize!.toMarkdown!(block)).toBe("### Title");
	});

	it("divider.serialize.toMarkdown returns ---", () => {
		const block = {
			id: "1",
			type: "divider" as const,
			props: {},
			content: "",
		};
		expect(divider.serialize!.toMarkdown!(block)).toBe("---");
	});

	it("bulletListItem.serialize.toMarkdown", () => {
		const block = {
			id: "1",
			type: "bulletListItem" as const,
			props: { indent: 0 },
			content: "Item",
		};
		expect(bulletListItem.serialize!.toMarkdown!(block)).toBe("- Item");
	});

	it("bulletListItem.serialize.toMarkdown with indent", () => {
		const block = {
			id: "1",
			type: "bulletListItem" as const,
			props: { indent: 2 },
			content: "Nested",
		};
		expect(bulletListItem.serialize!.toMarkdown!(block)).toBe(
			"    - Nested",
		);
	});

	it("checkListItem.serialize.toMarkdown checked", () => {
		const block = {
			id: "1",
			type: "checkListItem" as const,
			props: { indent: 0, checked: true },
			content: "Done",
		};
		expect(checkListItem.serialize!.toMarkdown!(block)).toBe("- [x] Done");
	});

	it("checkListItem.serialize.toMarkdown unchecked", () => {
		const block = {
			id: "1",
			type: "checkListItem" as const,
			props: { indent: 0, checked: false },
			content: "Todo",
		};
		expect(checkListItem.serialize!.toMarkdown!(block)).toBe("- [ ] Todo");
	});

	it("codeBlock.serialize.toMarkdown", () => {
		const block = {
			id: "1",
			type: "codeBlock" as const,
			props: { language: "ts" },
			content: "const x = 1;",
		};
		expect(codeBlock.serialize!.toMarkdown!(block)).toBe(
			"```ts\nconst x = 1;\n```",
		);
	});

	it("image.serialize.toMarkdown", () => {
		const block = {
			id: "1",
			type: "image" as const,
			props: { src: "test.png", alt: "Test" },
			content: "",
		};
		expect(image.serialize!.toMarkdown!(block)).toBe("![Test](test.png)");
	});

	it("blockquote.serialize.toMarkdown", () => {
		const block = {
			id: "1",
			type: "blockquote" as const,
			props: {},
			content: "Quote",
		};
		expect(blockquote.serialize!.toMarkdown!(block)).toBe("> Quote");
	});

	it("callout.serialize.toMarkdown", () => {
		const block = {
			id: "1",
			type: "callout" as const,
			props: { type: "warning" },
			content: "Be careful",
		};
		expect(callout.serialize!.toMarkdown!(block)).toBe(
			"> **Warning:** Be careful",
		);
	});
});

// ── AC 23: Mark priority ordering ─────────────────────────
describe("AC 23 — Mark priority ordering", () => {
	it("priorities are in correct ascending order", () => {
		expect(bold.priority).toBeLessThan(italic.priority!);
		expect(italic.priority).toBeLessThan(underline.priority!);
		expect(underline.priority).toBeLessThan(strikethrough.priority!);
		expect(strikethrough.priority).toBeLessThan(highlight.priority!);
		expect(highlight.priority).toBeLessThan(textColor.priority!);
		expect(textColor.priority).toBeLessThan(backgroundColor.priority!);
		expect(backgroundColor.priority).toBeLessThan(link.priority!);
		expect(link.priority).toBeLessThan(code.priority!);
	});

	it("bold has priority 100", () => {
		expect(bold.priority).toBe(100);
	});

	it("code has priority 900", () => {
		expect(code.priority).toBe(900);
	});
});

// ── Inline mark properties ────────────────────────────────
describe("inline mark properties", () => {
	it("bold is a mark with expand: after", () => {
		expect(bold.kind).toBe("mark");
		expect(bold.expand).toBe("after");
	});

	it("link is a mark with expand: none", () => {
		expect(link.kind).toBe("mark");
		expect(link.expand).toBe("none");
	});

	it("code is a mark with expand: none", () => {
		expect(code.kind).toBe("mark");
		expect(code.expand).toBe("none");
	});

	it("mention is a node", () => {
		expect(mention.kind).toBe("node");
	});

	it("inlineApp is a node", () => {
		expect(inlineApp.kind).toBe("node");
	});
});

// ── Block display metadata ────────────────────────────────
describe("block display metadata", () => {
	const allBlocks = [
		paragraph,
		heading,
		bulletListItem,
		numberedListItem,
		checkListItem,
		codeBlock,
		image,
		table,
		divider,
		callout,
		toggle,
		blockquote,
	];

	for (const schema of allBlocks) {
		it(`${schema.type} has display metadata`, () => {
			expect(schema.display).toBeDefined();
			expect(schema.display?.title).toBeTruthy();
		});
	}
});
