const PEN_PREFIX = "data-pen-";

export function penDataAttr(name: string): string {
  return `${PEN_PREFIX}${name}`;
}

export function buildDataAttributes(
  attrs: Record<string, string | number | boolean | undefined>,
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    result[`data-${key}`] = value === true ? "" : String(value);
  }
  return result;
}

export const DATA_ATTRS = {
  editorRoot: "data-pen-editor-root",
  editorContent: "data-pen-editor-content",
  editorBlock: "data-pen-editor-block",
  inlineContent: "data-pen-inline-content",
  fieldEditor: "data-pen-field-editor",
  blockHandle: "data-pen-block-handle",
  blockId: "data-block-id",
  blockType: "data-block-type",
  selected: "data-selected",
  focused: "data-focused",
  readonly: "data-readonly",
  empty: "data-empty",
  active: "data-active",
  dragging: "data-dragging",
  selecting: "data-selecting",
  inputMode: "data-input-mode",
  streaming: "data-streaming",
  expanded: "data-expanded",
  blockCount: "data-block-count",
  aiGenerating: "data-ai-generating",
  placeholderVisible: "data-placeholder-visible",
} as const;
