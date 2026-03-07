export {
  EditorRoot,
  EditorContent,
  EditorBlock,
  InlineContent,
  EditorBlockHandle,
  EditorDragOverlay,
  EditorSelectionRect,
  EditorFieldEditor,
} from "./editor/index.js";

export {
  ToolbarRoot,
  ToolbarGroup,
  ToolbarButton,
  ToolbarToggle,
  ToolbarSelect,
  ToolbarSeparator,
} from "./toolbar/index.js";

export {
  SlashMenuRoot,
  SlashMenuInput,
  SlashMenuList,
  SlashMenuGroup,
  SlashMenuItem,
  SlashMenuEmpty,
} from "./slash-menu/index.js";

// ── Pen.* namespace for compound component API ──────────────

import {
  EditorRoot,
  EditorContent,
  EditorBlock,
  InlineContent,
  EditorBlockHandle,
  EditorDragOverlay,
  EditorSelectionRect,
  EditorFieldEditor,
} from "./editor/index.js";

import {
  ToolbarRoot,
  ToolbarGroup,
  ToolbarButton,
  ToolbarToggle,
  ToolbarSelect,
  ToolbarSeparator,
} from "./toolbar/index.js";

import {
  SlashMenuRoot,
  SlashMenuInput,
  SlashMenuList,
  SlashMenuGroup,
  SlashMenuItem,
  SlashMenuEmpty,
} from "./slash-menu/index.js";

export const Pen = {
  Editor: {
    Root: EditorRoot,
    Content: EditorContent,
    Block: EditorBlock,
    InlineContent,
    BlockHandle: EditorBlockHandle,
    DragOverlay: EditorDragOverlay,
    SelectionRect: EditorSelectionRect,
    FieldEditor: EditorFieldEditor,
  },
  Toolbar: {
    Root: ToolbarRoot,
    Group: ToolbarGroup,
    Button: ToolbarButton,
    Toggle: ToolbarToggle,
    Select: ToolbarSelect,
    Separator: ToolbarSeparator,
  },
  SlashMenu: {
    Root: SlashMenuRoot,
    Input: SlashMenuInput,
    List: SlashMenuList,
    Group: SlashMenuGroup,
    Item: SlashMenuItem,
    Empty: SlashMenuEmpty,
  },
} as const;
