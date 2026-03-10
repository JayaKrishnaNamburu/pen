export {
  EditorRoot,
  EditorContent,
  EditorBlock,
  InlineContent,
  EditorBlockHandle,
  EditorDragOverlay,
  EditorSelectionRect,
  EditorFieldEditor,
} from "./editor/index";

export {
  ToolbarRoot,
  ToolbarGroup,
  ToolbarButton,
  ToolbarToggle,
  ToolbarSelect,
  ToolbarSeparator,
} from "./toolbar/index";

export {
  SlashMenuRoot,
  SlashMenuInput,
  SlashMenuList,
  SlashMenuGroup,
  SlashMenuItem,
  SlashMenuEmpty,
} from "./slash-menu/index";

export {
  SelectionToolbarRoot,
  SelectionToolbarContent,
} from "./selection-toolbar/index";

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
} from "./editor/index";

import {
  ToolbarRoot,
  ToolbarGroup,
  ToolbarButton,
  ToolbarToggle,
  ToolbarSelect,
  ToolbarSeparator,
} from "./toolbar/index";

import {
  SlashMenuRoot,
  SlashMenuInput,
  SlashMenuList,
  SlashMenuGroup,
  SlashMenuItem,
  SlashMenuEmpty,
} from "./slash-menu/index";

import {
  SelectionToolbarRoot,
  SelectionToolbarContent,
} from "./selection-toolbar/index";

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
  SelectionToolbar: {
    Root: SelectionToolbarRoot,
    Content: SelectionToolbarContent,
  },
} as const;
