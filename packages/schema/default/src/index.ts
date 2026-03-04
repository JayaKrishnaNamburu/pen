import type { BlockSchema, InlineSchema, ComposableSchema } from "@pen/core";

// ── Content Block Schemas ───────────────────────────────────

export const paragraph = { type: "paragraph" } as BlockSchema<"paragraph">;
export const heading = { type: "heading" } as BlockSchema<"heading">;
export const bulletList = { type: "bulletList" } as BlockSchema<"bulletList">;
export const numberedList = { type: "numberedList" } as BlockSchema<"numberedList">;
export const codeBlock = { type: "codeBlock" } as BlockSchema<"codeBlock">;
export const image = { type: "image" } as BlockSchema<"image">;
export const table = { type: "table" } as BlockSchema<"table">;
export const divider = { type: "divider" } as BlockSchema<"divider">;
export const callout = { type: "callout" } as BlockSchema<"callout">;
export const toggle = { type: "toggle" } as BlockSchema<"toggle">;
export const blockquote = { type: "blockquote" } as BlockSchema<"blockquote">;

// ── Inline Mark Schemas ─────────────────────────────────────

export const bold = { type: "bold", kind: "mark" } as InlineSchema<"bold">;
export const italic = { type: "italic", kind: "mark" } as InlineSchema<"italic">;
export const underline = { type: "underline", kind: "mark" } as InlineSchema<"underline">;
export const strikethrough = { type: "strikethrough", kind: "mark" } as InlineSchema<"strikethrough">;
export const code = { type: "code", kind: "mark" } as InlineSchema<"code">;
export const link = { type: "link", kind: "mark" } as InlineSchema<"link">;
export const highlight = { type: "highlight", kind: "mark" } as InlineSchema<"highlight">;
export const textColor = { type: "textColor", kind: "mark" } as InlineSchema<"textColor">;
export const backgroundColor = { type: "backgroundColor", kind: "mark" } as InlineSchema<"backgroundColor">;

// ── Inline Node Schemas ─────────────────────────────────────

export const mention = { type: "mention", kind: "node" } as InlineSchema<"mention">;
export const inlineApp = { type: "inlineApp", kind: "node" } as InlineSchema<"inlineApp">;

// ── Default Schema Registry ─────────────────────────────────

export const defaultSchema = {} as ComposableSchema;
