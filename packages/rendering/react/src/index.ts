import type { ReactNode, Ref } from "react";
import type {
  Editor,
  CreateEditorOptions,
  BlockHandle,
  Decoration,
  SelectionState,
  FieldEditor as FieldEditorInterface,
} from "@pen/core";

// ── useEditor ───────────────────────────────────────────────

export function useEditor(_options?: CreateEditorOptions): Editor {
  throw new Error("Not implemented");
}

// ── PenEditor (convenience wrapper) ─────────────────────────

export interface PenEditorProps {
  editor: Editor;
}

export function PenEditor(_props: PenEditorProps): ReactNode {
  throw new Error("Not implemented");
}

// ── Block Render Context ────────────────────────────────────

export interface BlockRenderContext {
  editable: boolean;
  selected: boolean;
  decorations: readonly Decoration[];
  ref: Ref<HTMLElement>;
}

// ── Compound Component Namespaces ───────────────────────────

export declare namespace Pen {
  namespace Editor {
    function Root(props: { editor: Editor; children?: ReactNode }): ReactNode;
    function Content(props: { virtualize?: boolean | { overscan?: number; estimatedHeight?: number }; children?: ReactNode }): ReactNode;
    function Block(props: { children?: ReactNode }): ReactNode;
    function BlockHandle(props: { children?: ReactNode }): ReactNode;
    function InlineContent(props: { children?: ReactNode }): ReactNode;
    function DragOverlay(props: { children?: ReactNode }): ReactNode;
    function SelectionRect(props: { children?: ReactNode }): ReactNode;
    function FieldEditor(props: { children?: ReactNode }): ReactNode;
  }

  namespace Toolbar {
    function Root(props: { children?: ReactNode }): ReactNode;
    function Group(props: { children?: ReactNode }): ReactNode;
    function Button(props: { children?: ReactNode; asChild?: boolean }): ReactNode;
    function Toggle(props: { format: string; children?: ReactNode; asChild?: boolean }): ReactNode;
    function Select(props: { format: string; options: string[]; children?: ReactNode }): ReactNode;
    function Separator(): ReactNode;
  }

  namespace SlashMenu {
    function Root(props: { open?: boolean; onOpenChange?: (open: boolean) => void; children?: ReactNode }): ReactNode;
    function Input(props: { placeholder?: string }): ReactNode;
    function List(props: { children?: ReactNode }): ReactNode;
    function Group(props: { heading?: string; children?: ReactNode }): ReactNode;
    function Item(props: { blockType?: string; onSelect?: () => void; children?: ReactNode }): ReactNode;
    function Empty(props: { children?: ReactNode }): ReactNode;
  }

  namespace AI {
    function Root(props: { model?: unknown; children?: ReactNode }): ReactNode;
    function Trigger(props: { children?: ReactNode }): ReactNode;
    function CommandMenu(props: { children?: ReactNode }): ReactNode;
    function CommandInput(props: { placeholder?: string }): ReactNode;
    function CommandList(props: { children?: ReactNode }): ReactNode;
    function CommandItem(props: { command: string; children?: ReactNode }): ReactNode;
    function GenerationZone(props: { children?: ReactNode }): ReactNode;
    function StreamingText(props: Record<string, unknown>): ReactNode;
    function Suggestion(props: { children?: ReactNode }): ReactNode;
    function Progress(props: Record<string, unknown>): ReactNode;
    function StepIndicator(props: Record<string, unknown>): ReactNode;
    function ToolInvocation(props: Record<string, unknown>): ReactNode;

    namespace TrackChanges {
      function Mark(props: { children?: ReactNode }): ReactNode;
    }

    namespace ActionBar {
      function Accept(props: { children?: ReactNode }): ReactNode;
      function Reject(props: { children?: ReactNode }): ReactNode;
      function Retry(props: { children?: ReactNode }): ReactNode;
    }

    namespace DiffView {
      function Root(props: { mode?: "inline" | "side-by-side"; children?: ReactNode }): ReactNode;
    }
  }

  namespace Collab {
    function Root(props: { children?: ReactNode }): ReactNode;
    function Cursor(props: Record<string, unknown>): ReactNode;
    function Selection(props: Record<string, unknown>): ReactNode;
    function PresenceList(props: { children?: ReactNode }): ReactNode;
    function PresenceItem(props: Record<string, unknown>): ReactNode;
  }
}

// ── Hooks ───────────────────────────────────────────────────

export function useFieldEditor(_editor: Editor): FieldEditorInterface {
  throw new Error("Not implemented");
}

export function useToolbar(_editor: Editor): unknown {
  throw new Error("Not implemented");
}

export function useSlashMenu(_editor: Editor): unknown {
  throw new Error("Not implemented");
}

export function useAI(_editor: Editor): unknown {
  throw new Error("Not implemented");
}

export function useCollab(_editor: Editor): unknown {
  throw new Error("Not implemented");
}

export function useLayout(_editor: Editor): unknown {
  throw new Error("Not implemented");
}

export function useDecorations(_editor: Editor): unknown {
  throw new Error("Not implemented");
}

export function useSelection(_editor: Editor): SelectionState {
  throw new Error("Not implemented");
}

// ── Model Adapter (re-exported for convenience) ─────────────

export interface ModelAdapter {
  stream(options: {
    messages: unknown[];
    tools: unknown;
    signal?: AbortSignal;
  }): unknown;
}

export function penToolSchemas(_tools: unknown): unknown {
  throw new Error("Not implemented");
}

// ── Schema Compilation ──────────────────────────────────────

export function createReactRenderers(
  _schema: unknown,
): Record<string, (props: BlockRenderContext) => ReactNode> {
  throw new Error("Not implemented");
}
