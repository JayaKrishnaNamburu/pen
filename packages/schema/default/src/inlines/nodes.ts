import type { InlineSchema, PropSchema } from "@pen/types";
import { prop, resolveSchema } from "@pen/types";

function resolveProps(
  props: Record<string, unknown>,
): Record<string, PropSchema> {
  const resolved: Record<string, PropSchema> = {};
  for (const [k, v] of Object.entries(props)) {
    resolved[k] = resolveSchema(v);
  }
  return resolved;
}

export const mention: InlineSchema = {
  type: "mention",
  propSchema: resolveProps({
    id: prop.string().default("").describe("Referenced entity ID"),
    label: prop.string().default("").describe("Display name"),
  }),
  kind: "node",
  serialize: {
    toMarkdown: (_, props) => `@${props?.label ?? ""}`,
    toHTML: (_, props) =>
      `<span class="mention" data-id="${props?.id ?? ""}">${props?.label ?? ""}</span>`,
  },
  aiDescription: "Mention of a user, page, or entity",
};

export const inlineApp: InlineSchema = {
  type: "inlineApp",
  propSchema: resolveProps({
    appType: prop.string().default("").describe("App type identifier"),
    config: prop.json().describe("App configuration"),
  }),
  kind: "node",
  serialize: {
    toMarkdown: (_, props) => `[app:${props?.appType ?? ""}]`,
    toHTML: (_, props) =>
      `<span class="inline-app" data-type="${props?.appType ?? ""}"></span>`,
  },
  aiDescription: "Inline embedded application",
};
