# Pen — Headless AI Editor Engine

## Technical Specification v0.1

---

## 1. Vision

Pen is an open-source, headless, extension-first editor engine built for human–AI co-authoring. It provides unstyled behavioral primitives, a schema-driven block system, and a tool surface that lets any LLM read, write, and manipulate documents.

Pen is model-agnostic: a minimal `ModelAdapter` interface (one method, four event types) works with any LLM client — including the Vercel AI SDK and its 25+ providers — while `@pen/mcp` exposes the same tools to bidirectional protocol clients.

Like Radix provides headless UI primitives and you bring the design system, Pen provides headless editor primitives and you bring the experience. The rich-text toolbar, the AI command palette, the slash menu, the collaboration cursors — these are all composable, unstyled behavioral layers that consumers style and assemble.

### Positioning

Pen sits between raw editor engines (ProseMirror, Lexical core) and opinionated editor toolkits (TipTap, Plate, BlockNote).

```
ProseMirror / Lexical       Pen                      TipTap / Plate / BlockNote
(raw engine)           (headless toolkit)            (opinionated toolkit)
◄────────────────────────────┼──────────────────────────────────►
no UI primitives        unstyled behavioral           styled components
build everything        primitives + AI-native        some assembly required
                        CRDT-first, schema-driven     framework-coupled
                        you bring the design          design decisions made
```

At its core, Pen is a **rich text and content editor** — the primary document flow is a vertical sequence of typed blocks (paragraphs, headings, lists, code). This is the authored backbone.

Pen adds two capabilities that pure block editors lack:

1. **Layout.** Blocks can live inside layout containers that arrange their children using flexbox or grid properties — columns, rows, sections with padding and background, responsive stacks. This enables marketing emails, landing pages, dashboards, and newsletters without leaving the block model. *(Layout is a post-core extension — see Section 4.10 and Milestones.)*

2. **Apps.** Rich, interactive embedded applications (charts, embeds, code outputs, images, mini figma, mini calendar, venmo) that live inline or anchored to blocks. Apps can be full React components with their own lifecycle, config, and sandboxed isolation. *(App system is a post-core extension — see Section 10.3 and Milestones.)*

**Flow-primacy rule:** The document always reads top-to-bottom. Layout is rendering instruction, not semantic reordering. Export to Markdown produces linear prose regardless of visual arrangement.

**Progressive capability:** A consumer can ship a pure block editor (ignore layout and apps), a document-with-layout (marketing emails), or a full app-enabled editor. Same engine, same schema, different rendering surface.

### Core Thesis

1. **Headless** — Behavior and state separated from rendering. Same engine powers Notion-style, Docs-style, Markdown-first, or headless CMS.
2. **AI-native** — Document model, operation format, and extension architecture designed around how LLMs generate and how humans collaborate with them.
3. **Extension-first** — Core is tiny. Everything — blocks, formatting, AI, multiplayer, execution, apps — is an extension. Extensions have rich lifecycle hooks.
4. **Schema-driven** — Block types, layout rules, and content defined as declarative schemas. Compile to React, Vue, Svelte, HTML, or SSR without changing the definition.
5. **Binary-first** — Documents are stored and transmitted as binary CRDT state. JSON, Markdown, and HTML are derived views at serialization boundaries.
6. **CRDT-portable (Yjs-first)** — Yjs is the default and directly integrated CRDT implementation. The document model uses Yjs types (Y.Doc, Y.Text, Y.Map, Y.Array) for zero-overhead integration. The architecture supports future portability to Loro or Automerge, but the abstraction layer hardens based on real adapter implementations, not upfront speculation.

---

## 2. Design Principles

1. **Headless over opinionated** — Ship behavior, not styles. Every visual element is unstyled. Pen never makes design decisions for the consumer.
2. **Schema over code** — Declarative schemas, not imperative render functions. Enables cross-framework rendering, serialization, LLM-friendly structured output.
3. **Extension-first** — If it can be an extension, it must be. Extensions have first-class lifecycle: CRDT observation, decorations, input rules, state.
4. **LLM-native** — No transaction pipeline. All writes go directly to the CRDT. Streaming tokens map to `ytext.insert()` calls. Programmatic mutations go through `editor.apply()` with schema validation at the boundary. Extensions observe CRDT events — they never intercept or block writes.
5. **Sync-agnostic** — CRDT collaboration is a default extension. Sync transport is pluggable.
6. **Model-agnostic** — Pen defines tools once; the consumer brings any model. A minimal `ModelAdapter` interface (Section 13.2) accepts any LLM client, including the AI SDK and its ecosystem. MCP support exposes the same tools to bidirectional protocol clients. No vendor API client is bundled.
7. **Composable primitives** — Complex behaviors emerge from combining simple primitives.
8. **Canonical documents** — One valid representation per document state. Schema normalization runs incrementally on dirty blocks, including during LLM streaming. No ambiguous formats, no CRDT divergence from structural inconsistency.
9. **Model-first writes** — No external system (browser, LLM, collaborator) directly mutates the document without schema validation. The CRDT document is the source of truth. Everything else is a projection.
10. **Single-editor principle** — Inspired by Cocoa's field editor. One shared content editor activates for the focused block. Blocks at rest are static renders. The editing surface moves to where attention is. Cross-block selection extends the field editor's scope temporarily.
11. **Testable by default** — Every layer is instantiable without a browser. Extensions, schemas, and document operations can be tested headlessly.
12. **Works out of the box** — Core extensions (undo, document-ops, delta-stream) are included by default. Users add or remove extensions; they don't assemble the baseline. `createEditor()` with zero arguments produces a working editor.
13. **Layered API** — Zero-config defaults at level 0; schema customization at level 1; extension/transport customization at level 2; full CRDT adapter control at level 3. Progressive disclosure of complexity.
14. **Development diagnostics** — Development mode provides actionable warnings for common mistakes (missing primitive context, schema validation fallbacks, extension conflicts). Diagnostics are stripped from production builds.

### Hello, Pen

The minimum viable Pen editor:

```typescript
import { createEditor } from '@pen/core'
import { PenEditor } from '@pen/react'

const editor = createEditor()

function App() {
  return <PenEditor editor={editor} />
}
```

No CRDT adapter constructor. No extensions array. No transport config. Yjs, undo, document-ops, and the default schema are included by default. You progressively add capabilities:

```typescript
import { createEditor, defaultSchema } from '@pen/core'
import { search } from '@pen/search'
import { collaboration } from '@pen/collaboration'
import { PenEditor } from '@pen/react'

const editor = createEditor({
  schema: defaultSchema.extend([myCustomBlock]),
  extensions: [
    search(),
    collaboration({ room: 'doc-123' }),
  ],
})
```

Full control for power users:

```typescript
import { createEditor } from '@pen/core'
import { loroAdapter } from '@pen/crdt-loro'

const editor = createEditor({
  schema: mySchema,
  extensions: [...],
  crdt: loroAdapter(),
})
```

The `CRDTAdapter` interface (Section 10.0) is only needed when swapping the CRDT implementation. The default is Yjs.

---

## 3. Architecture Overview

Three layers: **Schema** (data), **Headless** (behavior), **Rendering** (UI). Each independent and swappable. Yjs is the CRDT implementation, directly integrated for zero overhead.

### 3.1 Rendering Performance (Virtualization)

The 1000+ block performance target requires rendering virtualization. The field editor pattern makes this natural — only the active block is "live," so unmounted blocks have no contenteditable state to manage.

**Strategy:** Blocks outside the viewport plus a configurable overscan buffer are not mounted. They are represented by placeholder divs with cached heights. The rendering layer uses an intersection observer to mount/unmount blocks as they enter and leave the viewport.

- **Height tracking.** Block height is measured on first render and cached. Re-measured on content change via `ResizeObserver`. Before first render, a type-based height estimate is used (configurable per block type).
- **Field editor activation.** If the target block is not mounted (e.g., user clicks a search result in a distant block), the rendering layer mounts it synchronously before the field editor activates.
- **Cross-block selection.** When the field editor expands across blocks (Section 6.3), all blocks in the expanded range are mounted. The performance budget (>50 blocks = use BlockSelection instead of contenteditable expansion) still applies.
- **Decorations.** `decorations()` is called only for mounted blocks. Off-screen blocks with pending decorations receive them on mount.
- **Opt-in.** Virtualization is enabled via a `virtualize` option on `Pen.Editor.Content`. Small documents don't need it and skip the intersection observer overhead. Default: off for documents under a configurable threshold (e.g., 100 blocks), on above it.

```tsx
<Pen.Editor.Content virtualize />
<Pen.Editor.Content virtualize={{ overscan: 5, estimatedHeight: 40 }} />
```

```
┌─────────────────────────────────────────────────────────────────┐
│                        Consumer Application                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Rendering Layer                       │    │
│  │  (styled components — React, Vue, Svelte, vanilla HTML) │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │ consumes                          │
│  ┌──────────────────────────┴──────────────────────────────┐    │
│  │                   Headless Layer                         │    │
│  │  Unstyled behavioral primitives (like Radix/cmdk)       │    │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌──────────┐ │    │
│  │  │ Editor   │ │ Toolbar  │ │ SlashMenu  │ │ AI       │ │    │
│  │  │ .Root    │ │ .Root    │ │ .Root      │ │ .Root    │ │    │
│  │  │ .Block   │ │ .Group   │ │ .Input     │ │ .Trigger │ │    │
│  │  │ .Inline  │ │ .Button  │ │ .List      │ │ .Panel   │ │    │
│  │  │ .Layout  │ │ .Toggle  │ │ .Item      │ │ .Stream  │ │    │
│  │  │ .App     │ │          │ │            │ │          │ │    │
│  │  └──────────┘ └──────────┘ └────────────┘ └──────────┘ │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │    Field Editor (shared content editor)          │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │    Extension Host (tx hooks, decorations, state) │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │    Selection Manager (cross-block aware)         │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │    Decoration Engine (non-mutating overlays)     │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │ reads/writes                      │
│  ┌──────────────────────────┴──────────────────────────────┐    │
│  │                    Schema Layer                          │    │
│  │  CRDTDocument (abstract) ← block schemas, layout rules, │    │
│  │                             content model, app state     │    │
│  │  ┌────────────────────────────────────────────────┐     │    │
│  │  │  CRDTAdapter interface                         │     │    │
│  │  │  ├─ YjsAdapter (default)                       │     │    │
│  │  │  ├─ LoroAdapter (future)                       │     │    │
│  │  │  └─ AutomergeAdapter (future)                  │     │    │
│  │  └────────────────────────────────────────────────┘     │    │
│  └──────────────────────────┬──────────────────────────────┘    │
└─────────────────────────────┼───────────────────────────────────┘
                              │
                   ┌──────────┴──────────┐
                   │   Sync Extension    │
                   │   (binary updates)  │
                   └──────────┬──────────┘
                              │
                   ┌──────────┴──────────┐
                   │   Persistence       │
                   │   (binary-first)    │
                   └──────────┬──────────┘
                              │
                   ┌──────────┴──────────┐
                   │  Tool Server        │
                   │  (tool registry +   │
                   │   execution)        │
                   └──────────┬──────────┘
                              │
                   ┌──────────┴──────────┐
                   │  ModelAdapter       │
                   │  (any LLM client)   │
                   │  ┌────────────────┐ │
                   │  │ AI SDK, raw    │ │
                   │  │ HTTP, or any   │ │
                   │  │ LLM client     │ │
                   │  └────────────────┘ │
                   │         or          │
                   │  MCP Server         │
                   │  (bidirectional)    │
                   └─────────────────────┘
```

---

### 3.2 Foundational Types

Types referenced throughout the specification. Defined here for completeness.

```typescript
// ── Utility types ──────────────────────────────────────────
type Unsubscribe = () => void;

// ── Branded ID types (prevent misuse across ID namespaces) ─
type BlockId = string & { readonly __brand: 'BlockId' };
type AppId = string & { readonly __brand: 'AppId' };
type ZoneId = string & { readonly __brand: 'ZoneId' };
type DocId = string & { readonly __brand: 'DocId' };

// ── Document data types ────────────────────────────────────
interface Block<
  Type extends string = string,
  Props extends Record<string, unknown> = Record<string, unknown>
> {
  id: string;
  type: Type;
  props: Props;
  content?: string;                        // inline text content (for content: 'inline' blocks)
  children?: Block[];                      // nested blocks (for content: BlockSchema[] blocks)
}

interface App<
  Type extends string = string,
  Config extends Record<string, unknown> = Record<string, unknown>
> {
  id: string;
  type: Type;
  config: Config;
  placement: AppPlacement;
}

// ── Range (within-block offset+length; used by InlineSchema) ──
interface Range {
  index: number;
  length: number;
}
// See also: DocumentRange (Section 6.2) for cross-block ranges.

// ── Serialization node types ───────────────────────────────
interface MarkdownNode {
  type: string;
  children?: MarkdownNode[];
  value?: string;
  attributes?: Record<string, unknown>;
}

interface XMLElement {
  tagName: string;
  attributes: Record<string, string>;
  children: XMLElement[];
  textContent?: string;
}

// ── Extension context types ────────────────────────────────
interface ServerExtensionContext {
  editor: Editor;
  emit(event: string, payload?: unknown): void;
  getState<T>(name: string): T | undefined;
}

interface ClientExtensionContext extends ServerExtensionContext {
  dom: Document;
}

interface FieldEditorContext {
  blockId: string;
  schema: BlockSchema;
  editor: Editor;
}

interface DocumentState {
  blocks: Iterable<BlockHandle>;
  selection: SelectionState;
  generation: number;                       // monotonically increasing on each CRDT change
}

// ── Tool context (canonical definition in Section 13.2) ──
interface ToolContext {
  readonly editor: Editor;
  readonly docId: string;
  emit(part: PenStreamPart): void;
  insertBlock(blockType: string, props: Record<string, unknown>, position: Position): string;
  updateBlock(blockId: string, props: Record<string, unknown>): void;
  deleteBlock(blockId: string): void;
  beginStreaming(blockId: string): string;
  appendDelta(zoneId: string, text: string): void;
  endStreaming(zoneId: string, status: 'complete' | 'cancelled' | 'error'): void;
}

interface CommandContext {
  editor: Editor;
  selection: SelectionState;
  activeBlock: BlockHandle | null;
}

// ── CRDT types ─────────────────────────────────────────────
interface CRDTDocument {
  readonly adapter: CRDTAdapter;
}

// CRDT-level undo interface (returned by CRDTAdapter.createUndoManager).
// Pen wraps this with the higher-level UndoManager (Section 9.4) that adds
// origin filtering, idle-timeout grouping, and editor event integration.
interface CRDTUndoManager {
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  stopCapturing(): void;
}

interface Awareness {
  setLocalState(state: Record<string, unknown>): void;
  getStates(): Map<number, Record<string, unknown>>;
  on(event: 'change', callback: () => void): void;
  off(event: 'change', callback: () => void): void;
}

interface GenerationZone {
  id: string;
  blockId: string;
  range: DocumentRange;
  status: 'idle' | 'streaming' | 'complete' | 'error';
}

// ── Stream types ───────────────────────────────────────────
type PenStreamPart =
  | GenStartPart | GenDeltaPart | GenEndPart
  | BlockInsertPart | BlockUpdatePart | BlockDeletePart | BlockMovePart
  | LayoutUpdatePart
  | AppCreatePart | AppUpdatePart | AppDeletePart
  | StepStartPart | StepEndPart
  | ToolInputStartPart | ToolInputDeltaPart | ToolInputAvailablePart
  | ToolOutputPart | ToolErrorPart
  | DataPart
  | ErrorPart | AbortPart | PingPart | DonePart;

interface PenStreamRequest {
  docId: string;
  prompt?: string;
  selection?: SelectionState;
  context?: Record<string, unknown>;
  streamId?: string;
}

// ── Editor options ─────────────────────────────────────────
interface CreateEditorOptions {
  schema?: SchemaRegistry;
  extensions?: Extension[];
  without?: string[];
  crdt?: CRDTAdapter;
  assets?: AssetProvider;
}

// ── Position mapping (for decoration remapping) ────────────
interface PositionMapping {
  map(pos: number, blockId: string): number;
}

// ── Server config ──────────────────────────────────────────
interface ServerConfig {
  port?: number;
  host?: string;
  transport?: 'stdio' | 'sse' | 'ws';
}
```

---

## 4. Schema Layer

### 4.1 Block Schema Definition

```typescript
interface BlockSchema<
  Type extends string = string,
  Props extends Record<string, PropSchema> = {},
  Content extends ContentType = 'inline'
> {
  type: Type;
  propSchema: Props;
  content: Content;

  // ── Layout (when content is nested blocks) ─────────────
  // Declares how children are arranged. Only meaningful
  // when content = BlockSchema[]. Ignored for 'inline',
  // 'none', 'table'. See Section 4.10.
  layout?: LayoutSchema;

  // ── Serialization ──────────────────────────────────────
  serialize: {
    toMarkdown?: (block: Block<Type, Props>) => string;
    fromMarkdown?: (node: MarkdownNode) => Block<Type, Props> | null;
    toHTML?: (block: Block<Type, Props>) => string;
    fromHTML?: (element: HTMLElement) => Block<Type, Props> | null;
    toXML?: (block: Block<Type, Props>) => string;
    fromXML?: (element: XMLElement) => Block<Type, Props> | null;
  };

  // ── Normalization (Section 4.8) ────────────────────────
  normalize?: (block: Block<Type, Props>) => Block<Type, Props>;

  // ── Validation ─────────────────────────────────────────
  validateProps?: (raw: Record<string, unknown>) => Props;

  // ── Field editor type ──────────────────────────────────
  // Custom field editor for this block type.
  // Default: the shared rich-text field editor.
  fieldEditor?: 'richtext' | 'plaintext' | 'code' | 'none' | FieldEditorFactory;

  // ── LLM description ────────────────────────────────────
  aiDescription?: string;
}

type ContentType =
  | 'inline'          // rich text (field-editor target)
  | 'none'            // no content (divider, image-only)
  | 'table'           // rows × cells of inline
  | BlockSchema[];    // nested blocks (with optional layout)

// Type guard for nested-block content (the non-string variant)
function isNestedContent(content: ContentType): content is BlockSchema[] {
  return Array.isArray(content);
}

type FieldEditorFactory = (ctx: FieldEditorContext) => FieldEditor;
```

**`defineBlock` — DX layer over `BlockSchema`:**

`defineBlock` is to `BlockSchema` what `defineApp` (Section 14.2) is to `AppSchema`. It reduces boilerplate by auto-generating validation from prop definitions, inferring `aiDescription` from type name and prop descriptions, and returning a fully typed schema object.

```typescript
import { defineBlock, prop } from '@pen/core'

export const heading = defineBlock('heading', {
  props: {
    level: prop.enum([1, 2, 3, 4, 5, 6]).default(1).describe('Heading level'),
  },
  content: 'inline',
  serialize: {
    toMarkdown: (block) => `${'#'.repeat(block.props.level)} `,
    toHTML: (block) => `<h${block.props.level}>`,
  },
})

export const divider = defineBlock('divider', {
  content: 'none',
  fieldEditor: 'none',
  serialize: {
    toMarkdown: () => '---',
    toHTML: () => '<hr />',
  },
})
```

`defineBlock` does three things:
1. Auto-generates `validateProps` from prop definitions (no manual validator needed).
2. Auto-generates `aiDescription` from type name + prop descriptions (overridable).
3. Returns a typed `BlockSchema<Type, Props, Content>` — the return value is both the runtime schema and the TypeScript type.

The `BlockSchema` interface above remains the underlying type for advanced use cases or when maximum control is needed.

**`prop` builder — chainable JSON Schema construction:**

`prop.*` methods return JSON Schema objects. They are syntactic sugar — the output is standard JSON Schema as defined in Section 4.2.

```typescript
prop.string()                        // { type: 'string', default: '' }
prop.string().default('hello')       // { type: 'string', default: 'hello' }
prop.number().min(0).max(100)        // { type: 'number', default: 0, minimum: 0, maximum: 100 }
prop.boolean().default(true)         // { type: 'boolean', default: true }
prop.enum(['bar', 'line', 'pie'])    // { type: 'string', default: 'bar', enum: ['bar', 'line', 'pie'] }
prop.array(prop.string())            // { type: 'array', default: [], items: { type: 'string' } }
prop.object({ x: prop.number() })    // { type: 'object', default: { x: 0 }, properties: { ... } }
prop.optional(prop.string())         // { type: ['string', 'null'], default: '' }

// All builders support .describe() and .default()
prop.string().describe('The block title').default('Untitled')
```

### 4.2 Prop Schema System

Pen uses **JSON Schema** as the canonical format for block and app property definitions. JSON Schema is already the LLM standard for tool definitions, is natively serializable, and eliminates the need for a custom intermediate format. The `prop` builder (Section 4.1) provides a chainable DX layer that outputs JSON Schema directly.

```typescript
type PropSchema = JSONSchema7;
```

Prop schemas are standard JSON Schema objects. The `prop` builder produces them with sensible defaults and Pen-specific conventions (every property has a `default` value). The `json` catch-all (`{}` with no constraints) is discouraged — prefer typed schemas.

**Why JSON Schema, not a custom format:** JSON Schema is natively serializable and is the standard format for LLM tool definitions. A custom intermediate format (PropSchema → JSON Schema → Zod) adds an entire data format to the architecture for no benefit — JSON Schema already satisfies every requirement: serialization, LLM tool descriptions, and cross-framework schema compilation.

**Conversion utility:**
```typescript
import { toZod } from '@pen/core';       // JSON Schema → Zod schema (for runtime validation)
```

`toJSONSchema()` is not needed — the prop definitions are already JSON Schema.

### 4.3 Inline Content Schema

Inspired by Quill's dual-weight format system. Quill separates heavyweight Blots (structural, own a DOM node) from lightweight Attributors (metadata attached to someone else's node). Pen generalizes this as `kind: 'mark' | 'node'` and adds LLM-friendly strategy methods.

```typescript
interface InlineSchema<
  Type extends string,
  Props extends Record<string, PropSchema> = {}
> {
  type: Type;
  propSchema: Props;
  kind: 'mark' | 'node';  // mark = lightweight (bold), node = structural (mention)

  serialize: { toMarkdown?; fromMarkdown?; toHTML?; toXML?; };

  // ── Format strategies (Attributor-inspired) ────────────
  apply?(content: Y.Text, range: Range, value: any): void;
  remove?(content: Y.Text, range: Range): void;
  query?(content: Y.Text, index: number): any | null;

  // ── Normalization ──────────────────────────────────────
  priority?: number;  // lower = outer wrapper

  // ── Boundary behavior (Peritext-inspired) ─────────────
  // Controls whether text inserted at the mark's edges inherits this mark.
  // Yjs Y.Text has no per-attribute expand configuration — it always inherits
  // attributes from the position before the insert point. Pen enforces expand
  // policy at the input boundary (field editor, streaming, editor.apply) by
  // explicitly including or excluding mark attributes on each ytext.insert() call.
  // CRDT backends with native Peritext support (Loro) handle this at the CRDT
  // level and the input-boundary enforcement becomes a no-op pass-through.
  //
  //   'after'  - inserted text at end inherits the mark (bold, italic)
  //   'before' - inserted text at start inherits (rare, RTL use cases)
  //   'both'   - inserted text at either edge inherits (comment annotations)
  //   'none'   - inserted text at neither edge inherits (links, inline code)
  //
  // Default: 'after' for marks, N/A for nodes.
  expand?: 'after' | 'before' | 'both' | 'none';

  // ── System mark flag ──────────────────────────────────
  system?: boolean;  // true = always registered, excluded from LLM schema view

  aiDescription?: string;
}
```

**System marks.** Some inline marks are infrastructure-level — always registered regardless of the consumer's schema, excluded from `list_block_types` tool output, and invisible to the LLM's schema view. System marks use the same `InlineSchema` interface but are not part of `@pen/schema-default`. The core system mark is `suggestion` (see below). Extensions may register additional system marks.

```typescript
// System mark — always registered, not part of @pen/schema-default
const suggestion: InlineSchema<'suggestion', {
  id: prop.string(),
  action: prop.enum(['insert', 'delete']),
  author: prop.string(),
  authorType: prop.enum(['user', 'ai']),
  createdAt: prop.number(),
  model: prop.string().optional(),
}> = {
  type: 'suggestion',
  propSchema: { /* as above */ },
  kind: 'mark',
  system: true,
  expand: 'none',
  serialize: {
    toMarkdown: (text, props) =>
      props.action === 'delete' ? `{--${text}--}` : `{++${text}++}`,
    toHTML: (text, props) =>
      props.action === 'delete'
        ? `<del data-suggestion-id="${props.id}">${text}</del>`
        : `<ins data-suggestion-id="${props.id}">${text}</ins>`,
  },
}
```

The `suggestion` mark powers persistent track changes (Section 5.5). Content marked `action: 'delete'` and `action: 'insert'` coexist in the CRDT — the decoration engine reads these attributes to render diff views. Accept/reject are CRDT operations that add or remove suggestion attributes, not undo-stack operations. See Section 8.4.

### 4.4 Default Schema Set (`@pen/schema-default`)

**Content blocks:** paragraph, heading, bulletList, numberedList, codeBlock, image, table, divider, callout, toggle, blockquote.

**Layout blocks (post-core, `@pen/layout`):** section, row, column, stack, card. See Section 4.10.

**Inline marks:** bold, italic, underline, strikethrough, code, link, highlight, textColor, backgroundColor.

**Inline nodes:** mention, inlineApp.

**System marks (always registered):** suggestion.

**Mark boundary defaults (`expand`):**

| Mark | `expand` | Rationale |
|---|---|---|
| bold, italic, underline, strikethrough | `'after'` | Formatting marks expand — typing at the end of bold text continues bold. |
| highlight, textColor, backgroundColor | `'after'` | Visual formatting, same behavior as bold/italic. |
| link | `'none'` | Links are anchored to specific text. New text at the boundary should not become part of the link. |
| code | `'none'` | Inline code is a discrete span. Typing after it should produce normal text. |
| suggestion (system mark) | `'none'` | Suggestions have explicit boundaries managed by the track changes system. |
| mention, inlineApp (inline nodes) | N/A | Nodes are atomic — they don't have boundary expansion behavior. |

Every one replaceable. System marks are always present but can be overridden with a custom implementation via `schema.overrideSystemMark()`.

**Schema composition:** The default schema is a composable object, not a static list. Consumers add, remove, and override block definitions without forking the schema.

```typescript
import { defaultSchema } from '@pen/schema-default'
import { callout } from './blocks/callout'

// Add custom blocks
const schema = defaultSchema.extend([callout])

// Remove blocks you don't need
const schema = defaultSchema.without(['table', 'codeBlock'])

// Override a block's serialization or behavior
const schema = defaultSchema.override('heading', {
  serialize: { toMarkdown: customHeadingSerializer },
})

// Compose multiple schemas (last wins on conflict)
import { mergeSchemas } from '@pen/core'
const schema = mergeSchemas(defaultSchema, myCompanySchema, aiBlocksSchema)
```

`extend`, `without`, and `override` return new schema instances — the original is never mutated.

### 4.5 Schema Compilation

```typescript
import { createReactRenderers } from '@pen/react';
import { createVueRenderers } from '@pen/vue';
import { createHTMLRenderers } from '@pen/html';
```

Declarative schemas → mechanical framework translations. Custom render overrides optional.

### 4.6 Schema ↔ CRDT Mapping

The document model uses Yjs types directly for M0. The `CRDTAdapter` (Section 10.0) provides the swap point at the factory and serialization boundary — core data structures use concrete Yjs types.

```typescript
interface PenDocument {
  blockOrder: Y.Array<string>;
  blocks: Y.Map<Y.Map<unknown>>;          // blockId → { type, props, content, children, layout, meta? }
  apps: Y.Map<Y.Map<unknown>>;           // appId → { type, config, placement }
  metadata: Y.Map<unknown>;

  // ── Provided by the CRDT adapter ──────────────────────
  readonly adapter: CRDTAdapter;
}
```

**Per-block metadata.** Each block's `Y.Map` may contain an optional `meta` key — a `Y.Map<unknown>` for non-schema, non-validated metadata. Unlike `props`, the `meta` map is **excluded from normalization** and **excluded from schema validation**. It is CRDT-synced (collaborators see metadata updates), but it is not part of the block's semantic content.

Use cases for `meta`:
- **AI provenance:** `{ origin: 'ai', model: 'gpt-4o', timestamp: 1709567890 }`
- **Edit attribution:** `{ lastEditedBy: 'user-123', lastEditedAt: 1709567890 }`
- **Comment anchoring:** `{ commentIds: ['c1', 'c2'] }`
- **Extension-specific state:** Any extension can store per-block state here without polluting the schema-validated `props` namespace.

`meta` is keyed by extension name to prevent collisions: `block.meta.get('ai')`, `block.meta.get('comments')`. Extensions read and write metadata via the `BlockHandle` API (Section 4.7).

### 4.7 Block Handle API

Navigational convenience layer over CRDT document structure. Inspired by Quill's Parchment, where every Blot has `.parent`, `.prev`, `.next`, `.scroll` references forming a traversable linked tree — but without DOM coupling. Extension authors get Parchment-level ergonomics backed by CRDT state.

```typescript
interface BlockHandle {
  readonly id: string;
  readonly type: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly index: number;

  // ── Linked-list navigation ─────────────────────────────
  readonly prev: BlockHandle | null;
  readonly next: BlockHandle | null;
  readonly parent: BlockHandle | null;   // for nested/layout blocks
  readonly children: readonly BlockHandle[];

  // ── Tree traversal ─────────────────────────────────────
  descendants(type?: string): Iterable<BlockHandle>;
  ancestors(): Iterable<BlockHandle>;
  siblings(): Iterable<BlockHandle>;

  // ── Layout queries ─────────────────────────────────────
  readonly layout: LayoutProps | null;   // non-null if this is a layout container
  readonly isLayoutChild: boolean;
  layoutParent(): BlockHandle | null;

  // ── App queries ─────────────────────────────────────
  anchoredApps(): readonly AppHandle[];

  // ── Content access ─────────────────────────────────────
  textContent(): string;
  length(): number;

  // ── Metadata (non-schema, non-validated) ───────────────
  meta(namespace: string): Readonly<Record<string, unknown>> | null;
  setMeta(namespace: string, data: Record<string, unknown>): void;
}

interface AppHandle {
  readonly id: string;
  readonly type: string;
  readonly placement: AppPlacement;
  readonly config: Readonly<Record<string, unknown>>;
  readonly anchorBlock: BlockHandle | null;
}
```

Handles are **read-only projections** — lightweight views computed on demand from CRDT state. Mutations go through the editor API, which validates, normalizes, and commits to the CRDT document. Handles never cache stale state.

### 4.8 Schema Normalization

A valid Pen document must be **canonical and compact**: one representation per document state. Inspired by Quill's Parchment invariant that only one valid DOM tree can represent a given document.

Without normalization, LLM-generated content creates:
- **CRDT divergence** — two representations of the same content that the CRDT can't merge cleanly.
- **Diff noise** — AI Suggestion/DiffView primitives show spurious structural changes.
- **Round-trip failures** — serialize → deserialize doesn't produce identical CRDT state.

**Normalization rules (enforced by schema engine on dirty blocks):**

1. **Inline mark ordering.** Overlapping marks are always nested by `priority` (lower = outer). Bold wraps outside italic, link wraps outside highlight. Configurable per schema.
2. **No superfluous wrappers.** A mark that adds no formatting beyond its parent is stripped.
3. **No empty containers.** Blocks with `content: 'inline'` that are empty contain exactly one zero-width placeholder. Simplifies cursor placement and LLM operations.
4. **Prop defaults are omitted.** If a prop equals its schema default, it is stripped from CRDT storage. Reduces state size and token count.
5. **Block-type-specific rules.** Each `BlockSchema.normalize()` can enforce type-specific invariants.
6. **Layout normalization.** Empty layout containers are collapsed. Single-child rows/columns are unwrapped. Layout props that match the schema default are stripped.
7. **Metadata is excluded.** The `meta` key on each block's `Y.Map` is never touched by normalization. Extensions own their metadata namespace and are responsible for its consistency.
8. **System mark attributes are preserved.** System marks (e.g. `suggestion`) are never stripped by rule 2, never reordered by rule 1, and never merged with adjacent ranges of the same system mark type. Each system mark instance has a unique `id` and its attribute boundaries must be preserved exactly. This ensures track changes suggestions survive normalization — the suggestion mark is infrastructure, not formatting. Parallels rule 7 (metadata exclusion).
9. **No duplicate block IDs in `blockOrder` or `children`.** If a block ID appears more than once in `blockOrder` or in a parent's `children` array after a CRDT merge, keep only the last occurrence (last-writer-wins at the array level). This ensures convergence after concurrent `move-block` operations — Yjs implements move as delete + insert on `Y.Array`, and concurrent moves of the same block can produce duplicates (see Section 7.2). The Loro adapter's native movable tree CRDT handles this without normalization; this rule is a no-op when the backend supports atomic moves.

**Incremental normalization (dirty-flag tracking):**

Normalization is **per-block**, not per-document. The schema engine maintains a `dirtyBlockIds: Set<string>` that tracks which blocks need normalization. Only dirty blocks are normalized — untouched blocks are skipped entirely.

```typescript
interface SchemaEngine {
  markDirty(blockId: string): void;
  normalizeDirty(): void;    // normalizes only dirty blocks, then clears the set
  normalizeAll(): void;       // full-document pass — document load, migration only
}
```

**When blocks are marked dirty:**
- On `block-insert` and `block-update` — the affected block ID is added to the dirty set.
- On `gen-delta` flush — the block currently being streamed to is marked dirty.
- On paste/import — all inserted block IDs are added to the dirty set.
- On `editor.apply()` — each operation's `blockId` is added to the dirty set.
- On remote CRDT merge — blocks affected by the merge are marked dirty.

**When `normalizeDirty()` runs:**
- After every `editor.apply()` call.
- After every `gen-delta` batch flush (50–100ms window).
- After paste/import completes.
- After remote CRDT updates are applied.
- NOT on read — reads are always from already-normalized CRDT state.

**Full-document `normalizeAll()` only runs on:**
- Document load (migration path for schema changes).
- Explicit `editor.normalizeAll()` call.

This is critical for the 1000+ block performance target. A 1000-block document where the LLM edits 3 blocks normalizes 3 blocks, not 1000.

### 4.9 Schema Registry

The registry is the lookup table for block/inline resolution and the gatekeeper for unknown types from external sources (LLM output, paste, deserialization).

```typescript
interface SchemaRegistry {
  // ── Lookup ─────────────────────────────────────────────
  resolve(type: string): BlockSchema | null;
  resolveInline(type: string): InlineSchema | null;
  resolveApp(type: string): AppSchema | null;
  resolveLayout(type: string): LayoutSchema | null;
  allBlocks(): readonly BlockSchema[];
  allInlines(): readonly InlineSchema[];

  // ── Graceful unknown-type handling ─────────────────────
  onUnknownBlock?: (type: string, raw: any) =>
    | BlockSchema | 'drop' | 'passthrough';

  onUnknownInline?: (type: string, raw: any) =>
    | InlineSchema | 'drop' | 'passthrough';
}
```

Per-instance registries (inspired by Quill 2.0) — each editor can have its own recognized formats. Two editors on the same page can support different block types without conflict.

### 4.10 Layout System

Layout enables blocks to arrange their children using flexbox or grid properties. A layout block is any block whose `content` is `BlockSchema[]` and declares a `layout` schema. Layout is **rendering instruction** stored in the block's props — it tells the rendering layer how to position children. It is not semantic reordering: the document still reads top-to-bottom via `blockOrder` traversal.

**Layout is a post-core extension (`@pen/layout`).** The schema types are defined here for completeness, but implementation and all layout-specific behavior ship after core editing and AI streaming are stable. See Milestones.

```typescript
interface LayoutSchema {
  readonly modes: readonly ('flex' | 'grid')[];
  defaultMode: 'flex' | 'grid';
  allowedChildren?: string[];   // block types (empty = any)
  minChildren?: number;
  maxChildren?: number;
}

interface LayoutProps {
  display: 'flex' | 'grid';

  // ── Flex properties ────────────────────────────────────
  direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  wrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  gap?: number | string;
  alignItems?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justifyContent?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';

  // ── Grid properties ────────────────────────────────────
  columns?: string;
  rows?: string;
  autoFlow?: 'row' | 'column' | 'dense';

  // ── Box properties (both modes) ────────────────────────
  padding?: Spacing;
  margin?: Spacing;
  background?: string;
  border?: BorderDef;
  borderRadius?: number | string;
  width?: string;
  maxWidth?: string;
  minHeight?: string;
  overflow?: 'visible' | 'hidden' | 'auto';
}

interface LayoutChildProps {
  flex?: string;
  alignSelf?: 'start' | 'center' | 'end' | 'stretch';
  order?: number;
  gridColumn?: string;
  gridRow?: string;
  colSpan?: number;
}

type Spacing = number | { top?: number; right?: number; bottom?: number; left?: number };
type BorderDef = { width?: number; style?: string; color?: string };
```

**Why flexbox/grid props and not a custom layout engine:**
- Layout props map 1:1 to CSS. Rendering in any framework is a single `style` attribute or className mapping.
- HTML email export translates flex to table-based fallbacks mechanically.
- LLMs already understand CSS flex/grid from training data.
- CRDT-friendly. Layout is just block props.

---

## 5. Headless Layer — Behavioral Primitives

### 5.0 Primitive Conventions

All Pen primitives follow the same conventions as Radix Primitives. This section defines the contract.

**1. Compound components.** Every primitive group has a `.Root` that acts as context provider. Child primitives consume context from their nearest `.Root` ancestor. Rendering a child outside its `.Root` is a development-mode error.

**2. Uncontrolled by default, controlled by intent.** Stateful primitives work out of the box without managing state. Pass `defaultX` for initial values. For full control, use the `x` + `onXChange` pair:

```tsx
// Uncontrolled (default) — state managed internally
<Pen.SlashMenu.Root>
  <Pen.SlashMenu.Input placeholder="Type a command..." />
  <Pen.SlashMenu.List>
    <Pen.SlashMenu.Group heading="Basic">
      <Pen.SlashMenu.Item onSelect={handleSelect}>Paragraph</Pen.SlashMenu.Item>
    </Pen.SlashMenu.Group>
  </Pen.SlashMenu.List>
</Pen.SlashMenu.Root>

// Controlled — consumer owns the state
const [open, setOpen] = useState(false);
<Pen.SlashMenu.Root open={open} onOpenChange={setOpen}>
  ...
</Pen.SlashMenu.Root>
```

**3. `asChild` composition.** Every renderable primitive supports `asChild`. When set, the primitive merges its behavior, props, and event handlers onto its single child element instead of rendering a wrapper DOM node. This eliminates wrapper-div nesting and enables seamless composition with existing design system components:

```tsx
// Default — renders a <button>
<Pen.Toolbar.Button>Bold</Pen.Toolbar.Button>

// asChild — merges onto your component, no wrapper
<Pen.Toolbar.Button asChild>
  <MyDesignSystemButton variant="ghost" />
</Pen.Toolbar.Button>
```

**4. Unstyled with `data-*` targeting.** All primitives render no styles. They expose `data-*` attributes that reflect internal state. Consumers style with CSS attribute selectors:

```css
[data-pen-toolbar-button][data-active] {
  background: var(--accent);
}
[data-pen-editor-block][data-ai-generating] {
  border-left: 2px solid var(--ai-accent);
}
```

**5. Ref forwarding.** Every primitive forwards refs to its underlying DOM element.

**6. Server-safe.** Primitives that don't require browser APIs (Editor.Root, Toolbar.Root) render on the server. Primitives that require a browser (FieldEditor, DragOverlay) render null during SSR and hydrate on the client.

### 5.1 The Field Editor

Inspired by Cocoa's field editor pattern. In AppKit, every window has a single shared `NSTextView` that handles all text input. When a text field becomes active, the field editor inserts itself, becomes first responder, and handles all keyboard/IME/selection. When focus moves, it detaches and reattaches to the new field.

Pen applies the same principle: **one shared content editor per editor root.**

```
┌─────────────────────────────────────────────────┐
│  Editor.Root                                     │
│                                                  │
│  ┌─────────────────┐  ← static render (cheap)   │
│  │ heading block    │                            │
│  └─────────────────┘                             │
│  ┌─────────────────┐  ← static render (cheap)   │
│  │ paragraph block  │                            │
│  └─────────────────┘                             │
│  ┌─────────────────────────────────────┐         │
│  │ paragraph block   [FIELD EDITOR]    │ ← LIVE  │
│  │ ┌─────────────────────────────────┐ │         │
│  │ │ contenteditable · IME · cursor  │ │         │
│  │ │ selection · undo · AI stream    │ │         │
│  │ └─────────────────────────────────┘ │         │
│  └─────────────────────────────────────┘         │
│  ┌─────────────────┐  ← static render (cheap)   │
│  │ code block       │                            │
│  └─────────────────┘                             │
│  ┌─────────────────┐  ← static render (cheap)   │
│  │ section (layout) │                            │
│  │  ┌──────┐┌─────┐│                            │
│  │  │ col  ││ col ││  ← children static too     │
│  │  └──────┘└─────┘│                            │
│  └─────────────────┘                             │
└─────────────────────────────────────────────────┘
```

**How it works:**
1. User clicks/taps a block → the field editor **activates** for that block.
2. The field editor mounts a `contenteditable` (or platform-appropriate input surface) over the block's content region.
3. All keyboard, IME, paste, drag, selection, and undo events flow through the field editor.
4. The block's schema acts as **delegate** — it controls what content and formatting the field editor allows.
5. When focus moves to another block, the field editor **deactivates** from the current block (syncing final state to CRDT) and activates for the new one.
6. Blocks at rest are **static HTML renders** of their CRDT content — no contenteditable, no event listeners, no overhead.
7. **Cross-block selection** — the field editor **expands** to span multiple blocks. See Section 6.

**Why this matters for Pen:**
- **Performance.** One contenteditable instead of N. Large documents (500+ blocks) don't degrade — only the focused block is "live."
- **Input centralization.** Keyboard shortcuts, IME composition, clipboard handling, accessibility — all in one place, tested once.
- **LLM streaming.** The delta-stream extension owns all streaming lifecycle (`StreamingTarget`, defined below). Only one generation zone can be active at a time. The field editor does not manage streaming state — the delta-stream extension writes directly to the block's `Y.Text`.
- **Mobile.** iOS/Android virtual keyboards work with one input surface.
- **Headless purity.** The field editor is a behavioral primitive, not a visual component.

```typescript
interface FieldEditor {
  // ── State ──────────────────────────────────────────────
  readonly activeBlockId: string | null;
  readonly activeBlockIds: readonly string[];   // multiple during cross-block selection
  readonly isEditing: boolean;
  readonly selection: SelectionState;

  // ── Lifecycle ──────────────────────────────────────────
  activate(blockId: string): void;
  deactivate(): void;

  // ── Cross-block expansion ──────────────────────────────
  expandTo(blockId: string): void;         // extend editing scope to include this block
  contractToFocused(): void;               // shrink back to single block

  // ── Delegation ─────────────────────────────────────────
  readonly delegate: BlockSchema | null;

  // ── Input mode ─────────────────────────────────────────
  readonly inputMode: 'keyboard' | 'ime' | 'voice' | 'ai-stream';

  // ── Events ─────────────────────────────────────────────
  onActivate(callback: (blockIds: string[]) => void): Unsubscribe;
  onDeactivate(callback: (blockIds: string[]) => void): Unsubscribe;
  onSelectionChange(callback: (selection: SelectionState) => void): Unsubscribe;
}
```

**`StreamingTarget` — owned by `@pen/delta-stream` extension:**

AI streaming is independent of text editing. The `StreamingTarget` interface is owned by the delta-stream extension, not the field editor. On the server (headless mode), streaming works without a field editor — the delta-stream extension writes directly to the block's `Y.Text`. On the client, the delta-stream extension coordinates with the field editor for UI state (generation zone indicators, `data-streaming` attribute) but the field editor itself does not manage streaming lifecycle.

```typescript
interface StreamingTarget {
  readonly generationZone: GenerationZone | null;
  beginStreaming(zoneId: string, blockId: string): void;
  appendDelta(delta: string): void;
  endStreaming(status: 'complete' | 'cancelled' | 'error'): void;
}
```

**Non-editable blocks.** Blocks with `fieldEditor: 'none'` (images, dividers) never activate the field editor. Selection highlights them; keyboard events go to block-level commands (delete, move, convert).

**Input handling model (dual-mode: EditContext + contenteditable fallback, CRDT-first):**

Pen does not use ProseMirror, Slate, or Lexical. Transaction-based editors create a double-source-of-truth with CRDTs, force AI streaming through a heavy transaction pipeline, and don't support per-block field editor activation. Instead, Pen uses a dual-mode input strategy: the EditContext API where supported, with `contenteditable` + `beforeinput` as the fallback. Both paths produce identical CRDT operations.

**Backend selection.** At field editor activation, the runtime checks `'EditContext' in globalThis`. If supported, the `EditContextBackend` is used. Otherwise, the `ContentEditableBackend` is used. No polyfill is needed — the contenteditable path IS the fallback.

Both backends implement the same internal contract:

```typescript
interface InputBackend {
  activate(element: HTMLElement, ytext: Y.Text): void;
  deactivate(): void;
  updateSelection(relPos: Y.RelativePosition): void;
}
```

**EditContextBackend (preferred — Chromium 121+, Android Chrome 144+):**

EditContext decouples text input from the DOM entirely. Pen owns the full rendering pipeline. IME composition is handled natively by EditContext, eliminating Android/Gboard issues (keyCode 229, sentence duplication on Enter) and composition state mismatches.

1. An `EditContext` instance is created and attached to the active block's container element. No `contenteditable` attribute is set.
2. `EditContext.textupdate` events are mapped to CRDT operations: insert → `ytext.insert()`, delete → `ytext.delete()`, format → `ytext.format()`.
3. `EditContext.textformatupdate` events drive IME underline/highlight rendering.
4. `EditContext.characterboundsupdate` events provide character geometry for IME candidate window positioning.
5. Y.Text `observe` events trigger DOM updates. Selection is synced back to the EditContext via `updateSelection()`.

**ContentEditableBackend (fallback — Firefox, Safari, older browsers):**

1. Field editor mounts a `contenteditable` div over the active block's content region.
2. All `beforeinput` events are intercepted with `preventDefault()`.
3. `inputType` is mapped to CRDT operations: `insertText` → `ytext.insert()`, `deleteContentBackward` → `ytext.delete()`, `formatBold` → `ytext.format()`.
4. DOM selection is mapped to Y.Text relative positions via `Y.createRelativePositionFromTypeIndex()`.
5. Y.Text `observe` events trigger DOM updates (re-render inline content from CRDT state).
6. During IME composition (`isComposing: true`), the field editor buffers input and lets the browser manage the composition UI. On `compositionend`, the buffer is committed to the CRDT.

**Shared across both backends:**

7. `historyUndo` / `historyRedo` `inputType` events are intercepted and routed to Pen's UndoManager.
8. `insertFromPaste` is intercepted and routed to the clipboard pipeline (Section 5.9).
9. **Mark boundary expand enforcement (Peritext).** On every text insert, the backend resolves which marks are active at the insert position, then checks each mark's `InlineSchema.expand` policy (Section 4.3). Marks with `expand: 'none'` (links, code) are explicitly excluded from the `ytext.insert()` attributes argument when inserting at the mark's boundary. Marks with `expand: 'after'` (bold, italic) are included when inserting at the end of the mark's span. This is the correct enforcement point — Yjs has no per-attribute expand configuration, so Pen must control the attributes argument at insert time. Enforcing expand via post-hoc normalization would create a second CRDT mutation that fights the first, and on remote peers the original Yjs behavior fires again on sync, producing an infinite correction loop. The same expand enforcement runs in the `editor.apply()` path for `insert-text` ops and in the `StreamingTarget.appendDelta()` path for AI streaming (Section 11.6). When the CRDT backend supports native Peritext expand behavior (Loro), the enforcement becomes a no-op pass-through — the backend handles it at the CRDT level.

### 5.2 Editor Primitives
```
Pen.Editor.Root          [data-focused] [data-readonly] [data-empty]
Pen.Editor.Content       [data-empty]
Pen.Editor.Block         [data-block-type] [data-selected] [data-ai-generating]
Pen.Editor.BlockHandle   [data-dragging]
Pen.Editor.InlineContent [data-placeholder-visible]
Pen.Editor.Layout        [data-layout-mode] [data-direction]        (post-core, @pen/layout)
Pen.Editor.App          [data-app-type] [data-app-focused] [data-placement]  (post-core, @pen/apps)
Pen.Editor.DragOverlay   [data-position]
Pen.Editor.SelectionRect [data-selecting]
Pen.Editor.FieldEditor   [data-active] [data-input-mode] [data-streaming]
                         [data-expanded] [data-block-count]
```

`Pen.Editor.Content` renders the block list and hosts the field editor. It is the main content area between toolbars and menus. `PenEditor` is convenience sugar equivalent to `<Pen.Editor.Root><Pen.Editor.Content /></Pen.Editor.Root>` for the zero-config case.

### 5.3 Toolbar Primitives
```
Pen.Toolbar.Root / Group / Button / Toggle / Select / Separator
```

### 5.4 Slash Menu (cmdk-inspired)
```
Pen.SlashMenu.Root / Input / List / Group / Item / Empty
```

### 5.5 AI Primitives (`@pen/ai`)
```
Pen.AI.Root              [data-connected] [data-generating]
Pen.AI.Trigger           [data-open]
Pen.AI.CommandMenu       [data-open] [data-loading]
Pen.AI.CommandInput      [data-has-value] [data-submitting]
Pen.AI.CommandList / CommandItem
Pen.AI.GenerationZone    [data-status] [data-streaming]
Pen.AI.StreamingText     [data-streaming] [data-complete]
Pen.AI.Suggestion        [data-type] [data-accepted]
Pen.AI.TrackChanges      [data-mode] [data-suggestion-count]
Pen.AI.TrackChanges.Mark [data-action] [data-author-type] [data-status]
Pen.AI.DiffView          [data-has-changes] [data-mode]
Pen.AI.ActionBar         [data-visible]
Pen.AI.ActionBar.Accept  [data-disabled]
Pen.AI.ActionBar.Reject  [data-disabled]
Pen.AI.ActionBar.Retry   [data-disabled]
Pen.AI.Progress          [data-state]
Pen.AI.StepIndicator     [data-step-count] [data-current-step]
Pen.AI.ToolInvocation    [data-tool-name] [data-state]
```

`GenerationZone` is the compound component root for AI generation UI. It connects to the streaming pipeline automatically — no manual wiring. Its children subscribe to the active generation's state:

```tsx
<Pen.AI.GenerationZone>
  <Pen.AI.StreamingText />
  <Pen.AI.ActionBar>
    <Pen.AI.ActionBar.Accept />
    <Pen.AI.ActionBar.Reject />
    <Pen.AI.ActionBar.Retry />
  </Pen.AI.ActionBar>
</Pen.AI.GenerationZone>
```

`Accept` commits the generation to the document. `Reject` reverts it (undo the generation's undo group). `Retry` reverts and re-runs with the same prompt. All three follow the uncontrolled/controlled convention from Section 5.0.

**Pen has two suggestion models with different storage and lifecycle:**

**Ephemeral suggestions** (`Pen.AI.Suggestion`) render inline completions — ghost text that appears ahead of the cursor, similar to GitHub Copilot. `data-type` is `'inline'` (within a block) or `'block'` (suggests a new block after the current one). The user accepts with Tab (configurable) or dismisses by continuing to type. Ephemeral suggestion state is local to the editor instance — NOT stored in the CRDT and NOT synced to collaborators. Rendered as decorations (Section 8) — ghost text overlays that do not mutate the document. On accept, the suggestion content is written to the CRDT as a single undo group. On reject or dismissal, nothing was ever written. Only one ephemeral suggestion can be active per editor instance.

**Persistent suggestions / track changes** (`Pen.AI.TrackChanges`) provide a Google Docs-style "suggest" mode where proposed edits are stored in the CRDT as `suggestion` system mark attributes on `Y.Text` (Section 4.3). Unlike ephemeral suggestions, persistent suggestions are CRDT-synced to all collaborators, survive page reloads, and work when the client is offline. Multiple persistent suggestions can coexist in the same document — each has a unique `suggestion.id`.

`data-mode` on `Pen.AI.TrackChanges` is `'suggesting'` (all writes get suggestion marks instead of direct edits) or `'editing'` (normal mode). When the editor is in suggest mode:

1. Text inserts create new text with `suggestion` mark `{ action: 'insert', ... }`.
2. Text deletes mark the original text with `suggestion` mark `{ action: 'delete', ... }` instead of removing it.
3. The original and suggested text coexist in the CRDT — both are visible to the rendering layer.

`Pen.AI.TrackChanges.Mark` renders individual suggestion marks within a block. Its data attributes expose the mark's `action` (`'insert'` or `'delete'`), `authorType` (`'user'` or `'ai'`), and review status.

**Accept/reject for persistent suggestions** are CRDT operations, not undo-stack operations:

- **Accept:** Remove `suggestion` attributes from inserted text (it becomes permanent content). Delete original text that was marked `action: 'delete'`. The accepted content merges seamlessly into the document.
- **Reject:** Delete text that was marked `action: 'insert'`. Remove `suggestion` attributes from delete-marked original text (it stays as-is). The document returns to its pre-suggestion state.
- Both operations work across sessions, offline, and for any collaborator with permission. They do not depend on the undo stack — a suggestion created by User A can be accepted by User B days later.

`Pen.AI.DiffView` reads `suggestion` mark attributes from `Y.Text` to compute and render inline diffs. For ephemeral suggestions, it falls back to client-local decoration state. `data-mode` is `'inline'` (interleaved insert/delete markers) or `'side-by-side'` (two-column view).

### 5.6 Layout Primitives (`@pen/layout`, post-core)
```
Pen.Layout.Container     [data-display] [data-direction]
Pen.Layout.Item          [data-flex] [data-order]
Pen.Layout.Resizer       [data-axis] [data-dragging]
Pen.Layout.DropZone      [data-active] [data-position]
Pen.Layout.Breakpoint    [data-breakpoint] [data-active]
```

### 5.7 Collaboration Primitives (`@pen/collaboration`)
```
Pen.Collab.Root / Cursor / Selection / PresenceList / PresenceItem / AIPresence
```

### 5.8 Hook API

`createEditor` is the canonical, framework-agnostic entry point. `useEditor` is a React hook that either wraps an existing editor instance or creates one internally and manages its lifecycle. Both accept the same options.

```typescript
// Option A: create editor outside React (stable across re-renders)
const editor = createEditor({ schema: defaultSchema })

function App() {
  return <Pen.Editor.Root editor={editor}>...</Pen.Editor.Root>
}

// Option B: let useEditor manage lifecycle (created once, destroyed on unmount)
function App() {
  const editor = useEditor({ schema: defaultSchema })
  return <Pen.Editor.Root editor={editor}>...</Pen.Editor.Root>
}
```

`PenEditor` is convenience sugar for the zero-config case:

```tsx
// PenEditor is equivalent to:
// <Pen.Editor.Root editor={editor}>
//   <Pen.Editor.Content />
// </Pen.Editor.Root>
<PenEditor editor={editor} />
```

Feature-specific hooks receive the editor instance and return derived state or controllers:

```typescript
const fieldEditor = useFieldEditor(editor);
const toolbar = useToolbar(editor);
const slashMenu = useSlashMenu(editor);
const ai = useAI(editor);
const collab = useCollab(editor);
const layout = useLayout(editor);
const decorations = useDecorations(editor);
const selection = useSelection(editor);
```

### 5.9 Clipboard Architecture

Clipboard handling is a first-class subsystem. All clipboard operations flow through the field editor's `beforeinput` handler and the schema's serialization methods.

**Paste pipeline:**
1. `beforeinput` event with `inputType: 'insertFromPaste'` is intercepted.
2. `DataTransfer` is inspected for `application/x-pen-blocks` (lossless intra-Pen copy), `text/html`, and `text/plain` (in priority order).
3. If `application/x-pen-blocks`: parse JSON, validate against schema registry, normalize, write to CRDT.
4. If `text/html`: delegated to the HTML importer (`@pen/import-html`, Section 15.1). Parse HTML, walk DOM, call `BlockSchema.serialize.fromHTML()` for each recognized element, fall back to paragraph for unrecognized. Validate, normalize, write to CRDT.
5. If `text/plain`: delegated to the Markdown importer (`@pen/import-markdown`, Section 15.1). Split on newlines, create paragraph blocks. Validate, normalize, write to CRDT.
6. Each paste operation is a single undo group.

**Sanitization.** The paste pipeline is an injection surface — external applications and malicious web pages can write crafted HTML to the clipboard. `@pen/import-html` MUST sanitize input HTML before processing. Specifically:
- Strip `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>` elements and event handler attributes (`onclick`, `onerror`, etc.) before walking the DOM.
- `fromHTML()` implementations in block schemas receive already-sanitized DOM elements — they do not need to re-sanitize.
- The `application/x-pen-blocks` MIME type is validated against the schema registry (step 3), which prevents unknown block types from being injected. JSON parsing uses standard `JSON.parse()` — no `eval`.

**Copy pipeline:**
1. Selected blocks are serialized via `BlockSchema.serialize.toHTML()` and `BlockSchema.serialize.toMarkdown()`.
2. Clipboard is written with three MIME types: `text/html`, `text/plain` (Markdown fallback), and `application/x-pen-blocks` (Pen's canonical JSON for lossless round-trip).

**Cut:** Copy + delete selection.

### 5.10 Accessibility Architecture

Accessibility is a design requirement, not a post-hoc addition. Pen follows the patterns established by Radix Primitives.

**ARIA roles:**
- `Editor.Root`: `role="textbox"`, `aria-multiline="true"`, `aria-label` from consumer.
- `Editor.Block`: `role="group"` with `aria-label` derived from block type.
- `Toolbar.Root`: `role="toolbar"`, `aria-label="Formatting"`.
- `SlashMenu.Root`: `role="listbox"`, items have `role="option"`.

**Keyboard navigation:**
- Arrow Up/Down between blocks (when cursor is at block boundary).
- Enter to split block, Backspace at start to merge with previous.
- Tab/Shift+Tab for list indentation.
- Escape to deactivate field editor (move focus to block-level).

**AI streaming live regions:**
- Generation zones use `aria-live="polite"` to announce completion without interrupting.
- Streaming text is not announced character-by-character; announcement fires on sentence boundaries or on generation end.

**Focus management:**
- Field editor activation sets focus to the contenteditable element.
- Deactivation returns focus to the block container.
- Cross-block selection announces the range ("Selected blocks 3 through 7").

### 5.11 Error Handling

Pen defines error boundaries at each architectural layer to prevent cascading failures.

**Schema validation failure:** When an LLM or collaborator produces an operation that fails schema validation, the operation is dropped (not committed to CRDT). A diagnostic event is emitted: `{ type: 'validation-error', op, reason }`. The consumer can subscribe to diagnostics for logging or UI feedback.

**Extension observer failure:** If an extension's `observe` hook throws, the error is caught and logged. Other extension observers continue to fire. The extension is not disabled — the next CRDT event re-invokes it.

**CRDT merge producing invalid state:** After applying a remote CRDT update, the affected blocks are marked dirty and `normalizeDirty()` runs. If normalization cannot fix the state (e.g., a block references an unknown type), the `onUnknownBlock` handler on the schema registry is invoked. If that returns `'drop'`, the block is removed.

**Stream processing error:** An `error` part is emitted on the stream. The stream processing pipeline calls `streaming.endStreaming('error')` if a generation was in progress. The consumer receives the error through the `onError` callback.

---

## 6. Selection Model

Selection is a first-class subsystem, not an implementation detail. It governs how the field editor behaves across blocks, how programmatic operations target content, and how collaborative cursors are represented.

### 6.1 SelectionState

```typescript
type SelectionState =
  | TextSelection
  | BlockSelection
  | AppSelection
  | null;

interface TextSelection {
  type: 'text';
  anchor: { blockId: string; offset: number; };
  focus:  { blockId: string; offset: number; };

  readonly isCollapsed: boolean;
  readonly isMultiBlock: boolean;    // anchor.blockId !== focus.blockId
  readonly blockRange: string[];     // ordered list of blockIds from anchor to focus

  toRange(): DocumentRange;          // normalizes anchor/focus into start/end (Section 6.2)
}

interface BlockSelection {
  type: 'block';
  readonly blockIds: readonly string[];   // one or more selected blocks (non-text selection)
}

interface AppSelection {
  type: 'app';
  appId: string;
}
```

### 6.2 DocumentRange

`TextSelection` is cursor-semantic — it has `anchor` (where drag started) and `focus` (where it ended), reflecting directionality. Many subsystems need **direction-agnostic ranges** with normalized `start` and `end`. Rather than each subsystem reinventing range math, Pen defines `DocumentRange` as a shared primitive:

```typescript
interface DocumentRange {
  start: { blockId: string; offset: number };
  end: { blockId: string; offset: number };

  readonly isMultiBlock: boolean;
  readonly blockRange: string[];         // ordered blockIds from start to end

  contains(point: { blockId: string; offset: number }): boolean;
  overlaps(other: DocumentRange): boolean;
  equals(other: DocumentRange): boolean;

  // ── Conversion ──────────────────────────────────────────
  toTextSelection(): TextSelection;      // start → anchor, end → focus
}
```

**Where `DocumentRange` is used:**

| Subsystem | Usage |
|---|---|
| `GenerationZone` | Tracks the block range the AI is streaming into |
| `SearchResult` | Represents a match location within the document |
| `InlineDecoration` | `from`/`to` within a block (single-block range) |
| `Collaborative selection` | Rendered range of a remote user's selection |
| Tool provider context | What range the user is asking the LLM about |
| `replaceRange` operations | Programmatic range-targeted mutations |

`DocumentRange` is constructed from two points and normalizes order automatically (start is always before end in document order). `TextSelection.toRange()` (Section 6.1) converts anchor/focus into a normalized `DocumentRange`.

### 6.3 Cross-Block Selection and the Field Editor

When the user drags a selection that starts in one block and ends in another, the field editor must handle content that spans multiple blocks. This is the critical interaction between the single-editor principle and multi-block selection.

**Strategy: Expand-on-Drag, Contract-on-Collapse.**

```
1. User clicks in paragraph 3.
   → Field editor activates for block 3 (single block).

2. User shift-clicks in paragraph 7.
   → Selection becomes TextSelection with isMultiBlock: true.
   → Field editor EXPANDS: blocks 3–7 are dynamically
     converted from static renders to editable regions
     within a single contenteditable span.
   → Browser-native selection works across the expanded range.

3. User types (replacing selection) or clicks elsewhere.
   → Field editor CONTRACTS back to a single block.
   → Blocks outside the focused block return to static renders.

4. Ctrl+A (Select All).
   → Field editor expands to cover all blocks.
   → Or: implemented as BlockSelection of all blocks
     (no contenteditable expansion, just visual highlight + delete/copy).
```

**Implementation constraints:**
- **Expansion is lazy.** Only convert blocks to editable DOM on actual cross-block drag/keyboard selection. Do not pre-mount contenteditable on adjacent blocks.
- **IME safety.** Never expand/contract during an IME composition session. Wait for `compositionend`.
- **Static↔editable transition — single render function mandate.** The static render and the editable render of a block must produce visually identical DOM at the point of transition. Mismatches cause selection jumps. To enforce this, block renderers MUST use a **single render function** that receives an `editable: boolean` flag and produces identical DOM structure in both modes. The editable path adds `contenteditable` and event handlers; the static path renders the same elements without them. Two separate render paths (one for static, one for editable) are an architectural error — they will diverge. The rendering layer enforces this by providing a single `BlockRenderer` callback signature:

```typescript
type BlockRenderer<Props> = (
  block: BlockHandle,
  ctx: BlockRenderContext,
) => ReactElement;

interface BlockRenderContext {
  editable: boolean;
  selected: boolean;
  decorations: readonly Decoration[];
  ref: React.Ref<HTMLElement>;
}
```

The default renderers in `@pen/react` follow this pattern. Custom renderers registered via schema compilation (Section 4.5) receive the same `BlockRenderContext` and must honor the `editable` flag. Development mode warns if a custom renderer produces different DOM element counts or structure between `editable: true` and `editable: false`.

- **Performance budget.** Expanding to >50 blocks simultaneously is degenerate. For Ctrl+A on large documents, use BlockSelection (visual highlight, no contenteditable expansion) rather than a single massive contenteditable.
- **Virtualization interaction.** When `virtualize` is enabled (Section 3.1), unmounted blocks in the expanded range must be mounted before selection expansion. The >50 block limit keeps this practical.

### 6.4 Editor Interface

The `Editor` interface is the single source of truth for what you can do with an editor instance. It is returned by `createEditor()` and `useEditor()`.

```typescript
interface Editor {
  // ── Mutation ──────────────────────────────────────────
  apply(...ops: DocumentOp[]): void;
  applyWithOrigin(origin: OpOrigin, ...ops: DocumentOp[]): void;
  loadDocument(doc: CRDTDocument): void;

  // ── Block traversal ───────────────────────────────────
  blocks(type?: string): Iterable<BlockHandle>;
  getBlock(blockId: string): BlockHandle | null;
  firstBlock(): BlockHandle | null;
  lastBlock(): BlockHandle | null;
  blockCount(): number;

  // ── Selection ──────────────────────────────────────────
  setSelection(selection: SelectionState): void;
  getSelection(): SelectionState;
  selectBlock(blockId: string): void;
  selectBlocks(blockIds: string[]): void;
  selectText(blockId: string, from: number, to: number): void;
  selectAll(): void;

  // ── Selection-relative operations ──────────────────────
  getSelectedText(): string;
  getSelectedBlocks(): BlockHandle[];
  replaceSelection(content: string | Block[]): void;
  deleteSelection(): void;

  // ── Events (Section 7.6) ──────────────────────────────
  on<K extends keyof PenEventMap>(event: K, handler: PenEventMap[K]): Unsubscribe;
  on(event: string, handler: (...args: unknown[]) => void): Unsubscribe;

  // ── Undo (Section 9) ──────────────────────────────────
  readonly undoManager: UndoManager;

  // ── Lifecycle ─────────────────────────────────────────
  normalizeAll(): void;                // full-document normalization — load/migration only
  destroy(): void;
}
```

### 6.5 Collaborative Selection

Remote user selections are transmitted as `SelectionState` objects through the CRDT awareness protocol and rendered as decorations (Section 8). They never activate the field editor — they are visual-only overlays.

---

## 7. Extension Lifecycle

Extensions are Pen's primary composition mechanism. Extensions have CRDT observation, decorations, input rules, and extension-local state.

### 7.1 Extension Interface

```typescript
interface Extension {
  name: string;
  version: string;
  readonly dependencies?: readonly string[];

  // ── Server-side lifecycle ──────────────────────────────
  activateServer?(ctx: ServerExtensionContext): Promise<void>;
  deactivateServer?(): Promise<void>;

  // ── Client-side lifecycle ──────────────────────────────
  activateClient?(ctx: ClientExtensionContext): Promise<void>;
  deactivateClient?(): Promise<void>;

  // ── CRDT observation ─────────────────────────────────
  // Called after CRDT writes. Read-only — cannot intercept or reject.
  // Fires on all writes: user keystrokes, AI deltas, programmatic apply(), collaborator updates.
  observe?(events: CRDTEvent[], editor: Editor): void;

  // ── Decorations ────────────────────────────────────────
  // Produce non-mutating visual overlays (Section 8).
  decorations?(state: DocumentState, editor: Editor): DecorationSet;

  // ── Input Rules ────────────────────────────────────────
  // Auto-format triggers (Section 7.3).
  readonly inputRules?: readonly InputRule[];

  // ── Keyboard bindings ──────────────────────────────────
  readonly keyBindings?: readonly KeyBinding[];

  // ── Extension state ────────────────────────────────────
  // Reactive state that updates atomically with document changes.
  state?: ExtensionStateSpec<unknown>;
}
```

**`defineExtension` — reduced boilerplate for simple extensions:**

Most extensions only use one or two capabilities. `defineExtension` infers `version` and accepts partial fields, parallel to `defineBlock` (Section 4.1) and `defineApp` (Section 14.2):

```typescript
import { defineExtension } from '@pen/core'

// Extension with just an input rule
const autoHeading = defineExtension({
  name: 'auto-heading',
  inputRules: [{
    match: /^(#{1,6})\s$/,
    handler: (match, editor, blockId) => {
      editor.apply(
        { type: 'convert-block', blockId, newType: 'heading', newProps: { level: match[1].length } },
        { type: 'delete-text', blockId, offset: 0, length: match[0].length },
      )
    },
    blockTypes: ['paragraph'],
  }],
})

// Extension with multiple capabilities
const wordCount = defineExtension({
  name: 'word-count',
  state: {
    init: (editor) => countWords(editor),
    apply: (count, events, editor) => countWords(editor),
  },
  observe: (events, editor) => {
    // side effect: update external counter
  },
})
```

`defineExtension` returns an `Extension` object. The raw `Extension` interface above remains available for advanced use cases requiring lifecycle hooks (`activateServer`, `activateClient`).

### 7.2 Operations and the CRDT-Delta Model

Pen has no transaction pipeline. The CRDT IS the document, and all writes go directly to it. This is a hard architectural rule — it eliminates the double-source-of-truth problem that plagues transaction-based editors (ProseMirror, Lexical) and keeps the write path fast enough for AI streaming at 100+ tokens/second.

**`DocumentOp`** is the command vocabulary for programmatic mutations. `editor.apply()` validates ops against the schema, then writes directly to the CRDT inside a `Y.transact()` batch. User keystrokes and AI deltas bypass `DocumentOp` entirely — they write to `Y.Text` directly via `beforeinput` interception (Section 5.1).

```typescript
type OpOrigin = 'user' | 'ai' | 'collaborator' | 'extension' | 'history';

type Position =
  | { after: string }                   // after block with given ID
  | { before: string }                  // before block with given ID
  | { parent: string; index: number }   // inside a container block at index
  | 'first'                             // beginning of document
  | 'last'                              // end of document

type DocumentOp =
  | { type: 'insert-block';   blockId: string; blockType: string; props: Record<string, unknown>; position: Position; }
  | { type: 'update-block';   blockId: string; props: Record<string, unknown>; }
  | { type: 'delete-block';   blockId: string; }
  | { type: 'move-block';     blockId: string; position: Position; }
  | { type: 'convert-block';  blockId: string; newType: string; newProps?: Record<string, unknown>; }
  | { type: 'split-block';    blockId: string; offset: number; newBlockId: string; newBlockType?: string; }
  | { type: 'merge-blocks';   targetBlockId: string; sourceBlockId: string; }
  | { type: 'insert-text';    blockId: string; offset: number; text: string; marks?: Record<string, unknown>; }
  | { type: 'delete-text';    blockId: string; offset: number; length: number; }
  | { type: 'format-text';    blockId: string; offset: number; length: number; marks: Record<string, unknown>; }
  | { type: 'update-layout';  blockId: string; layout: Partial<LayoutProps>; }
  | { type: 'create-app';    appId: string; appType: string; config: Record<string, unknown>; placement: AppPlacement; }
  | { type: 'update-app';    appId: string; patch: Record<string, unknown>; }
  | { type: 'delete-app';    appId: string; }
  | { type: 'set-selection';  selection: SelectionState; };
```

`split-block` splits the block at `offset` into two blocks. Content after `offset` moves to the new block (`newBlockId`). The new block inherits the original block's type unless `newBlockType` is provided (e.g., pressing Enter in a heading creates a paragraph). `merge-blocks` appends the inline content of `sourceBlockId` to the end of `targetBlockId`, then deletes `sourceBlockId`. Both are atomic — extensions receive a single op to react to rather than inferring intent from a sequence of lower-level ops.

`convert-block` changes a block's type. Conversion semantics:

- Validates `newType` against the schema registry. Fails if unknown type.
- Strips props that don't exist in the new type's schema. Adds missing props with their schema defaults.
- If `newProps` is provided, those values override the defaults.
- Preserves inline content if both old and new types support `content: 'inline'`. If the new type has `content: 'none'`, inline content is discarded. If the old type has `content: 'none'` and the new type has `content: 'inline'`, an empty text node is created.
- This is a single atomic op — extensions receive `convert-block`, not a sequence of delete + insert.

**`move-block` concurrent safety.** In Yjs, `move-block` is implemented as delete-from-old-position + insert-at-new-position on `blockOrder` (a `Y.Array`). Yjs has no native tree move operation. When two peers concurrently move the same block to different positions, both delete + insert pairs execute, producing duplicate entries of the same block ID in `blockOrder`. This is a convergence bug that surfaces under concurrent block drag-and-drop. Normalization rule 9 (Section 4.8) enforces the invariant. The Loro adapter's native movable tree CRDT handles concurrent moves atomically without duplication.

**Write flow (no pipeline):**

```
User keystroke        → beforeinput → ytext.insert() ─┐
AI streaming token    → gen-delta   → ytext.insert() ─┤
                                                       ├→ Y.transact() batch
Programmatic / LLM    → editor.apply(ops)              │   → Yjs observe events fire
tool call               → schema validate              │     → Extension observers react
                        → CRDT write ──────────────────┤     → UndoManager captures
                                                       │     → editor emits 'change' event
Collaborator          → Yjs binary update → apply ─────┘     → React re-renders
```

Extensions **observe** CRDT events after writes — they cannot intercept, modify, or reject writes before they happen. Validation happens at the input boundary (inside `editor.apply()`), not in a pipeline. User keystrokes and AI deltas skip validation entirely because they are structurally valid by construction (`beforeinput` interception only produces valid CRDT operations).

**`CRDTEvent`** wraps Yjs events into an extension-consumable type:

```typescript
interface CRDTEvent {
  origin: OpOrigin;
  readonly affectedBlocks: readonly string[];
  ops: readonly DocumentOp[];           // derived from Yjs event for programmatic introspection
  timestamp: number;
}
```

For the default Yjs adapter, `CRDTEvent` is derived from `Y.observeDeep` callbacks: `origin` maps from the `Y.transact()` origin parameter, `affectedBlocks` is computed from the Yjs event targets, and `ops` is reconstructed from the Yjs delta (insert/delete/retain) for extensions that need semantic awareness of what changed.

### 7.3 Input Rules

Input rules are pattern-triggered transformations that run on text input, inspired by ProseMirror's inputRules and Lexical's TextNodeTransform.

```typescript
interface InputRule {
  // Match against text before cursor after a character is typed.
  match: RegExp;

  // Handler receives match result and mutates via editor.apply() or direct CRDT writes.
  handler: (match: RegExpMatchArray, editor: Editor, blockId: string) => void;

  // Optional: only fire in specific block types.
  blockTypes?: string[];
}

// Example: Auto-heading (type "# " at start of paragraph)
const headingRule: InputRule = {
  match: /^(#{1,6})\s$/,
  handler: (match, editor, blockId) => {
    editor.apply(
      { type: 'convert-block', blockId, newType: 'heading', newProps: { level: match[1].length } },
      { type: 'delete-text', blockId, offset: 0, length: match[0].length },
    );
  },
  blockTypes: ['paragraph'],
};

// Example: Auto-divider (type "---" on empty line)
const dividerRule: InputRule = {
  match: /^---$/,
  handler: (match, editor, blockId) => {
    editor.apply(
      { type: 'convert-block', blockId, newType: 'divider' },
    );
  },
  blockTypes: ['paragraph'],
};
```

### 7.4 Key Bindings

```typescript
interface KeyBinding {
  key: string;                          // e.g. 'Mod-b', 'Enter', 'Tab'
  handler: (editor: Editor, event: KeyboardEvent) => boolean;  // return true = handled
  priority?: number;                    // higher = runs first
  context?: {
    blockType?: string[];
    hasSelection?: boolean;
    collapsed?: boolean;
    withinLayout?: string[];
  };
}
```

### 7.5 Extension State

Per-extension reactive state that updates on CRDT events. Replaces ad-hoc state management in extensions.

```typescript
interface ExtensionStateSpec<T> {
  init(editor: Editor): T;
  apply?(state: T, events: CRDTEvent[], editor: Editor): T;
}

// Example: word count extension
const wordCountState: ExtensionStateSpec<number> = {
  init: (editor) => countWords(editor),
  apply: (count, events, editor) => countWords(editor),
};
```

Extension state is accessed via hooks:

```typescript
const wordCount = useExtensionState(editor, 'word-count');
```

### 7.6 Editor Events

The editor exposes a consumer-facing event system for application integration. Extension observation hooks (`observe`) fire on all CRDT writes; consumer events provide a simpler API for application code that needs to react to changes.

```typescript
const editor = createEditor({ ... })

// Subscribe to events
const unsub = editor.on('change', (events) => {
  autosave(editor)
})

editor.on('selectionChange', (selection) => {
  updateToolbar(selection)
})

editor.on('focus', () => { })
editor.on('blur', () => { })

// Unsubscribe
unsub()
```

**Core event types:**

```typescript
interface PenEventMap {
  'change': (events: CRDTEvent[]) => void;
  'selectionChange': (selection: SelectionState) => void;
  'focus': () => void;
  'blur': () => void;
}
```

**Extension-emitted events.** Extensions can emit custom events through the editor context. Consumers subscribe to them with the same `editor.on()` API:

```typescript
// In extension (activateClient)
ctx.emit('search:match', { count: 5, query: 'hello' });

// In consumer
editor.on('search:match', ({ count, query }) => {
  updateSearchUI(count, query)
})
```

Custom events are namespaced by extension name to avoid collisions. The event system is typed — extension authors declare their event map via module augmentation, and consumers get autocomplete:

```typescript
// In @pen/search (module augmentation)
declare module '@pen/core' {
  interface PenEventMap {
    'search:match': (result: { count: number; query: string }) => void;
    'search:clear': () => void;
  }
}
```

The `Editor.on()` overload for `string` events provides a fallback for dynamic or untyped events. The typed overload for `keyof PenEventMap` is preferred and takes priority during overload resolution.

---

## 8. Decoration System

Decorations are non-mutating visual overlays on document content. They are produced by extensions and rendered by the rendering layer without touching the CRDT document.

### 8.1 Decoration Types

```typescript
type Decoration =
  | InlineDecoration
  | BlockDecoration
  | AppDecoration;

interface InlineDecoration {
  type: 'inline';
  blockId: string;
  from: number;
  to: number;
  attrs: Record<string, string | number | boolean>;  // CSS classes, data attributes, styles
  key?: string;                        // stable key for React reconciliation
}

interface BlockDecoration {
  type: 'block';
  blockId: string;
  attrs: Record<string, string | number | boolean>;
  position?: 'before' | 'after' | 'wrap';  // inject element relative to block
}

interface AppDecoration {
  type: 'app';
  blockId: string;
  offset: number;                      // inline position
  component: ComponentType<unknown>;   // render arbitrary inline app
  key: string;
}
```

### 8.2 DecorationSet

```typescript
interface DecorationSet {
  readonly decorations: readonly Decoration[];
  readonly generation: number;             // monotonically increasing, incremented on mutation

  // ── Queries ────────────────────────────────────────────
  forBlock(blockId: string): readonly Decoration[];
  inlineForBlock(blockId: string): readonly InlineDecoration[];

  // ── Change detection ───────────────────────────────────
  equals(other: DecorationSet): boolean;   // structural equality by generation counter
  map(mapping: PositionMapping): DecorationSet;  // remap positions after CRDT changes
}

// ── Construction (standalone functions — interfaces cannot have static members) ──
function createDecorationSet(decorations: Decoration[]): DecorationSet;
function emptyDecorationSet(): DecorationSet;
```

**Change detection.** The rendering layer uses `generation` to skip re-renders when decorations haven't changed. If an extension's `decorations()` returns a `DecorationSet` with the same `generation` as the previous render, the renderer skips re-rendering decorated blocks for that extension. `DecorationSet.map(mapping)` returns the same instance (same `generation`) when the mapping doesn't affect any decoration positions — this is the common case for CRDT events that touch blocks without decorations.

`PositionMapping` is derived from the `CRDTEvent`'s affected blocks and offset changes, similar to ProseMirror's `Mapping`. Extensions that track decoration state in `ExtensionStateSpec` should use `map()` in their `apply()` to incrementally update positions rather than rebuilding the full set.

### 8.3 Built-in Decoration Producers

These ship as extensions, composed from the decoration system:

- **`@pen/search`** — Search highlights. Produces `InlineDecoration` for matches.
- **`@pen/spellcheck`** — Spell-check underlines.
- **`@pen/ai`** — Ephemeral suggestion overlays (ghost text from client-local state), persistent track changes decorations (derived from `suggestion` system mark attributes on `Y.Text`), diff highlights, generation zone indicators. See Section 8.4.
- **`@pen/collaboration`** — Remote user cursors and selections (derived from CRDT awareness state).
- **`@pen/lint`** — Grammar/style linting annotations.

Extensions produce decorations via the `decorations()` method on the Extension interface (Section 7.1). The decoration engine merges all extension decoration sets and passes them to the rendering layer.

`decorations()` is called by the rendering layer when preparing a render, not on every CRDT event. Extensions that need to update decorations incrementally should track decoration state inside their `ExtensionStateSpec` (Section 7.5) — using `apply(state, events)` to update only affected block decorations on each CRDT event — and have `decorations()` return the current cached set. Full recompute on every call is acceptable for simple extensions but will not scale to 1000+ block documents with multiple decoration producers.

### 8.4 CRDT-Derived Decorations

Decorations have two source models:

**Source-independent decorations** are produced by extension logic — search matches, spell-check underlines, lint annotations. The extension computes positions from document content, stores them in `ExtensionStateSpec`, and remaps them via `DecorationSet.map()` when the document changes. These are the decorations described in Sections 8.1–8.3.

**CRDT-derived decorations** are produced by reading state that already lives in the CRDT — `Y.Text` formatting attributes, awareness state, block metadata. The CRDT is the source of truth; the extension's `decorations()` method reads CRDT state and produces `Decoration` objects. No position remapping is needed because CRDT attributes travel with the text items they're attached to.

The key distinction: source-independent decorations must track positions and remap them on every CRDT event. CRDT-derived decorations are always positionally correct because the CRDT handles position tracking.

**Track changes decorations** (`@pen/ai`):

The `@pen/ai` extension reads `suggestion` system mark attributes from each block's `Y.Text` via `ytext.toDelta()`. For each delta segment with a `suggestion` attribute:

- `action: 'insert'` → `InlineDecoration` with `class: 'pen-suggestion-insert'` (green highlight by default, unstyled — consumer provides the visual treatment).
- `action: 'delete'` → `InlineDecoration` with `class: 'pen-suggestion-delete'` (strikethrough/red by default, unstyled).
- Data attributes expose `data-suggestion-id`, `data-suggestion-action`, `data-suggestion-author`, `data-suggestion-author-type` for consumer styling.

Because suggestion attributes are CRDT-native, these decorations:
- Sync to all collaborators automatically — every peer sees the same suggestions.
- Survive page reloads — the CRDT document is the source of truth.
- Handle concurrent edits correctly — if another user inserts text adjacent to a suggestion, the suggestion mark stays on the original text items.
- Work when the client is offline — suggestions created on the server appear when the client reconnects and syncs.

**Collaboration decorations** (`@pen/collaboration`):

Remote user cursors and selections are another case of CRDT-derived decorations. The awareness protocol provides cursor positions that the extension reads and converts to `InlineDecoration` / `BlockDecoration` objects.

---

## 9. Undo/Redo Architecture

Undo is architecturally complex in a collaborative, AI-streaming editor. This section defines the model.

Pen delegates undo entirely to the CRDT layer. For the default Yjs adapter, this means `Y.UndoManager`. There is no application-level undo stack, no `UndoGroup` objects, and no transaction-based undo grouping. The CRDT's undo manager captures CRDT operations directly and reverses them on undo.

### 9.1 Undo Capture Boundaries

`Y.UndoManager.stopCapturing()` inserts a boundary. Operations before and after the boundary become separate undo steps. Pen calls `stopCapturing()` at these points:

1. **Field editor activation/deactivation.** Each time the field editor activates for a new block, `stopCapturing()` is called. All edits within a single field editor session form one undo step.
2. **AI generation completion.** All CRDT writes from a single AI generation (gen-start through gen-end, including any tool calls) form one undo step. `stopCapturing()` is called at gen-start and gen-end. "Undo AI generation" reverses the entire output. User edits within the generation zone during an active generation join this same undo group (Section 17.6).
3. **Idle timeout.** Within a single field editor session, `stopCapturing()` is called after 1000ms of no input (configurable). This creates "undo by phrase" rather than "undo by character."
4. **Paste.** `stopCapturing()` is called before and after each paste operation. Each paste is its own undo step.
5. **Programmatic.** Extensions can call `editor.undoManager.stopCapturing()` to insert boundaries explicitly.

### 9.2 Origin-Tagged Undo

Undo respects write origin. The Yjs `UndoManager` is configured with `trackedOrigins` so that each client only undoes its own writes.

- **User undo** reverses the user's own most recent undo step.
- **Collaborator changes are never undone** by another user's Ctrl+Z. They remain in the document.
- **AI-generated content** is written with `Y.transact(doc, fn, 'ai')`. The triggering client's UndoManager tracks both `'user'` and `'ai'` origins. Other collaborators' UndoManagers do not track `'ai'` from that client. During an active generation, user writes within the generation zone are merged into the generation's undo group (Section 17.6).

### 9.3 Undo Interaction with Field Editor

```
1. User edits paragraph 3 (field editor active).
   → CRDT operations accumulate in the current undo capture window.

2. User clicks paragraph 7 (field editor deactivates from 3, activates for 7).
   → stopCapturing() called. New capture window begins.

3. User presses Ctrl+Z.
   → UndoManager reverses the most recent capture window (paragraph 7 changes undone).
   → Field editor remains on paragraph 7.

4. User presses Ctrl+Z again.
   → UndoManager reverses the previous capture window (paragraph 3 changes undone).
   → Field editor activates for paragraph 3.
```

### 9.4 UndoManager Interface

Pen wraps the CRDT's undo manager with a thin interface:

```typescript
interface UndoManager {
  undo(): boolean;                     // returns true if undo was performed
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;

  // ── Capture control ───────────────────────────────────
  stopCapturing(): void;               // insert undo boundary
  setGroupTimeout(ms: number): void;   // idle timeout for auto-boundaries (default: 1000)

  // ── Origin filtering ──────────────────────────────────
  setTrackedOrigins(origins: OpOrigin[]): void;

  // ── Events ─────────────────────────────────────────────
  onStackChange(callback: () => void): Unsubscribe;
}
```

---

## 10. Document Model

### 10.0 CRDT Abstraction Layer

Pen's document model is defined against an abstract `CRDTAdapter` interface, not a specific CRDT library. The adapter is a **factory + serialization boundary** — a swap point for replacing the underlying CRDT, not a full type abstraction. Pen's core code uses Yjs types directly for M0. When a second adapter is built (M3+), shared type interfaces will be extracted from real usage patterns.

```typescript
interface CRDTAdapter {
  // ── Document lifecycle ─────────────────────────────────
  createDocument(): CRDTDocument;
  loadDocument(binary: Uint8Array): CRDTDocument;

  // ── Binary encoding ────────────────────────────────────
  encodeState(doc: CRDTDocument): Uint8Array;
  encodeUpdate(doc: CRDTDocument, since?: Uint8Array): Uint8Array;
  applyUpdate(doc: CRDTDocument, update: Uint8Array): void;

  // ── Batching ────────────────────────────────────────────
  transact(doc: CRDTDocument, fn: () => void, origin?: string): void;

  // ── Undo ───────────────────────────────────────────────
  createUndoManager(doc: CRDTDocument, options?: UndoManagerOptions): CRDTUndoManager;

  // ── Awareness (collaboration) ──────────────────────────
  createAwareness?(doc: CRDTDocument): Awareness;

  // ── Observation ────────────────────────────────────────
  observe(doc: CRDTDocument, callback: (event: CRDTEvent) => void): Unsubscribe;

  // ── Snapshots (version history) ────────────────────────
  createSnapshot(doc: CRDTDocument): Uint8Array;
  restoreSnapshot(doc: CRDTDocument, snapshot: Uint8Array): CRDTDocument;

  // ── Update compaction ──────────────────────────────────
  // Merges multiple binary updates into a single update without loading a
  // full document into memory. Deduplicates overlapping operations and
  // produces a smaller encoding. For Yjs: Y.mergeUpdates(). This is the
  // backing operation for PenPersistence.compact() (Section 10.1).
  mergeUpdates?(updates: Uint8Array[]): Uint8Array;

  // ── Branching (optional, Section 10.5) ─────────────────
  fork?(doc: CRDTDocument): CRDTDocument;
  merge?(target: CRDTDocument, source: CRDTDocument): void;

  // ── Attribution ────────────────────────────────────────
  getClientId(doc: CRDTDocument): number;

  // ── Escape hatch ───────────────────────────────────────
  // Returns the underlying CRDT instance for hot-path code that
  // needs direct access (field editor, AI streaming, relative positions).
  raw<T>(doc: CRDTDocument): T;
}
```

The adapter does NOT define abstract `SharedText`, `SharedMap`, or `SharedArray` interfaces. Each CRDT library has fundamentally different rich text models (Yjs's `Y.Text` vs Loro's `LoroText` vs Automerge's `Text`). Specifying shared type interfaces upfront would produce an abstraction that needs rewriting the moment a second adapter is implemented. Instead:

- For M0, core code imports and uses `Y.Text`, `Y.Map`, `Y.Array` directly.
- Hot-path code (field editor, streaming) calls `adapter.raw<Y.Doc>(doc)` to access the underlying Yjs document for Yjs-specific APIs like `Y.createRelativePositionFromTypeIndex()`.
- When a second adapter ships, the shared type interfaces are extracted from real adapter implementations, not guessed.

**`raw()` blast radius budget.** To keep future CRDT portability practical, only the following modules may call `adapter.raw()` or import CRDT-specific types (e.g., `Y.Text`, `Y.RelativePosition`):

| Module | Justification |
|---|---|
| `field-editor.ts` | Needs `Y.Text` observe for DOM sync, `Y.RelativePosition` for cursor mapping, mark boundary `expand` enforcement on `ytext.insert()` attributes |
| `streaming/` (`@pen/delta-stream`) | Writes `ytext.insert()` on the hot path at 100+ tokens/sec, mark boundary `expand` enforcement on streaming inserts |
| `selection.ts` | Maps DOM selection to `Y.RelativePosition` for CRDT-portable cursor storage |
| `crdt/document.ts` | The `PenDocument` factory — creates `Y.Array`, `Y.Map` instances |
| `history/` (`@pen/history`) | Needs `Y.snapshot`, `Y.createDocFromSnapshot`, `Y.encodeSnapshot`, `Y.decodeSnapshot`, item-level `clientID` access for per-character attribution |
| `track-changes/` (`@pen/ai`) | Reads `Y.Text` delta attributes for `suggestion` system mark; uses `ytext.format()` for mark application |

All other modules — `schema/`, `decorations.ts`, `extension-manager.ts`, `apply.ts`, exporters, importers — must go through the `CRDTAdapter` interface or operate on `BlockHandle` / `DocumentOp` abstractions. Modules outside this list must not import CRDT-specific types.

When a second adapter is implemented (M3+), only the six modules above need adapter-specific code paths. Everything else works unchanged.

**Default implementation: `@pen/crdt-yjs`**

`createEditor` uses Yjs internally when no `crdt` option is provided. Most consumers never construct a CRDT adapter directly.

```typescript
// Level 0: Zero config — Yjs, default schema, core extensions included
const editor = createEditor();

// Level 1: Custom schema
const editor = createEditor({
  schema: defaultSchema.extend([myCustomBlock]),
});

// Level 2: Custom extensions
const editor = createEditor({
  schema: defaultSchema,
  extensions: [search(), collaboration({ room: 'doc-123' })],
});

// Level 3: Full control — alternative CRDT adapter
import { loroAdapter } from '@pen/crdt-loro';

const editor = createEditor({
  schema: mySchema,
  extensions: [...],
  crdt: loroAdapter(),
});
```

**Future implementations:**
- `@pen/crdt-loro` — Loro CRDT. Native movable tree (concurrent block moves without duplication — normalization rule 9 becomes a no-op), Rust/WASM performance, Fugue-based text CRDT with maximal non-interleaving (concurrent insertions from different peers stay contiguous, never interleave character-by-character), and Peritext-compliant rich text marks with native configurable `expand` behavior (the input-boundary expand enforcement in Section 5.1 becomes a no-op pass-through).
- `@pen/crdt-automerge` — Automerge (JSON document model, Peritext-compliant rich text with native `expand` support).

**Why Yjs is the default:** Mature ecosystem, y-websocket/y-indexeddb/y-protocols exist, proven at scale (JupyterLab, etc.), XmlFragment maps well to rich text. But Yjs's lack of native tree move operations, its JavaScript-only implementation, and its lack of per-attribute mark boundary control (Section 4.3, `expand`) are real limitations that future adapters can address.

### 10.1 Binary-First Storage

Pen documents are stored and transmitted as binary CRDT state vectors (`Uint8Array`). **This is a protocol requirement, not an implementation detail.** All persistence providers, sync transports, and document pool implementations MUST operate on binary updates.

```typescript
interface PenPersistence {
  loadDocument(docId: string): Promise<Uint8Array | null>;
  saveSnapshot(docId: string, state: Uint8Array): Promise<void>;
  appendUpdate(docId: string, update: Uint8Array): Promise<void>;
  getUpdates(docId: string, since?: Uint8Array): Promise<Uint8Array[]>;
  compact(docId: string): Promise<void>;

  // ── Version snapshots (Section 10.1.1) ──────────────────
  saveVersionSnapshot(docId: string, snapshot: Uint8Array, metadata: VersionMetadata): Promise<void>;
  listVersions(docId: string, options?: { limit?: number; before?: string }): Promise<VersionEntry[]>;
  loadVersion(docId: string, versionId: string): Promise<{ state: Uint8Array; snapshot: Uint8Array }>;
}
```

**`compact()` mechanism.** `compact` reads all accumulated incremental updates for a document and merges them into a single binary snapshot via `CRDTAdapter.mergeUpdates()` (Section 10.0). This reduces storage size (duplicate operations are deduplicated) and speeds up document loading (one update to apply instead of N). For Yjs, this delegates to `Y.mergeUpdates()` — the merge happens on raw binary data without loading a `Y.Doc` into memory, making it safe to run as a background server task.

### 10.1.1 Version History and Attribution

Pen documents have built-in version history and per-character attribution, powered by CRDT snapshots and item-level client identity tracking.

**Snapshot-based version history.** The `CRDTAdapter.createSnapshot()` method (Section 10.0) captures a point-in-time view of the document as a compact binary blob. Snapshots are stored alongside the document via the version snapshot methods on `PenPersistence` (Section 10.1).

```typescript
interface VersionMetadata {
  label?: string;                // "AI generation", "Manual save", auto-generated
  trigger: 'auto' | 'manual' | 'ai-generation' | 'import';
  clientId: number;
  timestamp: number;
}

interface VersionEntry {
  id: string;
  metadata: VersionMetadata;
  createdAt: number;
}
```

**Auto-snapshot triggers.** The `@pen/history` extension (Section 14.11) automatically creates version snapshots at these points:

1. **Before AI generation** — `gen-start` triggers a snapshot. If the generation is rejected, this snapshot is the restore point.
2. **After AI generation accept** — captures the post-accept state as a version checkpoint.
3. **Periodic** — after a configurable interval of activity (default: 5 minutes). No snapshot is created during idle periods.
4. **Manual** — user-triggered "save version" via the editor API or UI.

**Per-character attribution.** Every Yjs item carries the `clientID` of the peer that created it. The editor maintains a `clientID` → identity mapping in the document's `metadata` Y.Map:

```typescript
// Stored in PenDocument.metadata under key 'clientIdentities'
type ClientIdentityMap = Y.Map<{
  userId: string;
  displayName: string;
  type: 'user' | 'ai';
  model?: string;              // for AI: 'gpt-4o', 'claude-4', etc.
  firstSeen: number;           // timestamp
}>
```

The mapping is CRDT-synced — all peers share the same identity resolution. When a new client connects (user or AI agent), it registers its identity in this map keyed by its `clientID` (as a string). `@pen/history` reads this mapping to attribute every character in the document to its author. Combined with `CRDTAdapter.restoreSnapshot()`, this enables "who wrote this paragraph?" and "show me the document as it was on Tuesday" workflows.

### 10.2 Asset Management

Block types like `image` reference external binary assets (images, files, media). Binary assets MUST NOT be stored inline in the CRDT document — embedding media in the Y.Doc bloats CRDT state, degrades sync performance, and makes document snapshots impractically large. Instead, blocks store asset references (IDs or URLs), and the `AssetProvider` interface manages the upload/resolve/delete lifecycle.

```typescript
interface AssetProvider {
  upload(file: File | Blob, options?: AssetUploadOptions): Promise<AssetRef>;
  resolve(ref: AssetRef): string;         // ref → display URL (may apply transforms)
  delete?(ref: AssetRef): Promise<void>;
}

interface AssetRef {
  id: string;
  url: string;                            // canonical URL after upload
  mimeType: string;
  size: number;                           // bytes
}

interface AssetUploadOptions {
  filename?: string;
  mimeType?: string;
  maxSize?: number;                       // consumer-configurable limit
  onProgress?: (progress: number) => void;
}
```

**How blocks reference assets:** The `image` block's `props.src` stores the `AssetRef.url` (or `AssetRef.id` for consumers that use `resolve()` indirection). The URL is a plain string in the CRDT — no binary data touches the Y.Doc.

**Provider is consumer-supplied.** Pen does not bundle a storage backend. Consumers provide an `AssetProvider` when creating the editor:

```typescript
const editor = createEditor({
  assets: myS3AssetProvider(),
})
```

If no `AssetProvider` is configured, image paste/drop operations produce a development-mode warning and fall back to `data:` URLs (acceptable for demos, not for production).

**Bundled provider stubs:**
- `@pen/assets-memory` — In-memory blob store for testing and demos.
- Consumers implement `AssetProvider` for their storage backend (S3, Cloudflare R2, Vercel Blob, etc.).

### 10.3 App Placement Model

Apps live in the document with one of two placement modes (floating removed from core — see rationale below):

```typescript
type AppPlacement =
  | { mode: 'inline';    blockId: string; index: number; }
  | { mode: 'anchored';  blockId: string; anchor: AnchorPosition; }

type AnchorPosition =
  | 'before' | 'after' | 'left' | 'right' | 'overlay';

interface AppSchema<
  Type extends string = string,
  Config extends Record<string, PropSchema> = {}
> {
  type: Type;
  configSchema: Config;
  defaultPlacement: AppPlacement['mode'];
  allowedPlacements: AppPlacement['mode'][];
  onAnchorDeleted?: 'delete' | 'orphan';

  // ── Sandboxing (Section 10.4) ──────────────────────────
  isolation?: 'none' | 'error-boundary' | 'iframe';

  serialize: {
    toMarkdown?: (app: App<Type, Config>) => string;
    toHTML?: (app: App<Type, Config>) => string;
    toXML?: (app: App<Type, Config>) => string;
  };

  aiDescription?: string;
}
```

**Why floating placement is removed from core:** Floating apps with `{x, y, z}` coordinates require a viewport/camera system, z-order management, and spatial interaction design that constitute a canvas engine — not a document editor. If needed, floating placement can be added as a `@pen/canvas` extension post-core. Inline and anchored placement cover >95% of document editing use cases.

### 10.4 App Sandboxing

Every app renders inside a safety boundary. The isolation level is declared in the AppSchema.

```typescript
// isolation: 'none'
// App renders directly in the editor's React tree.
// Fastest. Used for first-party, trusted apps.
// A crash in the app crashes the editor.
// App component can use Pen hooks (useEditor, useSelection, etc.)
// because it lives inside the Pen.Editor.Root React context.
// This is the intended access model for first-party apps that need
// to read document structure (e.g., table of contents, comments sidebar).

// isolation: 'error-boundary' (default)
// App renders inside a React error boundary.
// Crashes are caught and display a fallback UI.
// App has no direct access to editor internals.
// Communication: props down (config), events up (onConfigChange, onAction).

// isolation: 'iframe'
// App renders in a sandboxed iframe.
// Full isolation. Used for untrusted/third-party apps.
// Communication: postMessage.
// Performance: higher overhead (separate render context).
```

**Access model by isolation level:**

| Capability | `'none'` | `'error-boundary'` | `'iframe'` |
|---|---|---|---|
| Pen React context (hooks) | Yes | No | No |
| Read blocks/selection | Via hooks | Via `AppProps` only | Via `postMessage` |
| Subscribe to changes | Via `editor.on()` | Via `onRequestAction` | Via `postMessage` |
| Direct CRDT access | Possible but discouraged | No | No |
| Crash isolation | None | Error boundary | Full |

`isolation: 'none'` apps are trusted first-party components. They render inside the `Pen.Editor.Root` context provider and can call hooks like `useEditor()`, `useSelection()`, and `useFieldEditor()`. This is how a table-of-contents app reads heading blocks, or how a comments sidebar subscribes to block changes. Direct CRDT access via `adapter.raw()` is technically possible but discouraged — use the `Editor` interface and `BlockHandle` API instead.

**App ↔ Editor communication contract:**

```typescript
// Props provided to app component:
interface AppProps<Config> {
  config: Readonly<Config>;
  placement: AppPlacement;
  isSelected: boolean;
  isEditable: boolean;

  // ── Actions (events up) ────────────────────────────────
  onConfigChange: (patch: Partial<Config>) => void;
  onRequestAction: (action: string, payload?: unknown) => void;
}

// Apps with isolation: 'error-boundary' or 'iframe' NEVER
// have direct access to:
// - The CRDT document
// - The editor API
// - Other apps' state
// - The field editor
//
// Apps with isolation: 'none' CAN access these via React
// context (see access model table above).
```

### 10.5 Document Branching

Document branching provides mechanical isolation for AI generation. The AI writes to a forked CRDT document; the user's document is untouched until the user accepts the result. This enables async/background AI operations where the client may not be connected, multi-generation workflows with independent branches, and clean undo semantics (the user's undo stack is never polluted by in-progress AI work).

**Adapter API.** Branching is optional on the `CRDTAdapter` — adapters that don't support forking return `undefined` and branching features are unavailable:

```typescript
interface CRDTAdapter {
  // ... existing methods ...

  // ── Branching (optional) ────────────────────────────────
  fork?(doc: CRDTDocument): CRDTDocument;
  merge?(target: CRDTDocument, source: CRDTDocument): void;
}
```

For the Yjs adapter, `fork` encodes the source doc's state via `Y.encodeStateAsUpdate(sourceDoc)`, creates a new `Y.Doc`, and applies the update. `merge` encodes the branch's state as an update relative to the target's state vector and applies it via `Y.applyUpdate()`. Updates are commutative, associative, and idempotent — merge order doesn't matter.

**Branch diffing.** `diffBranches` is a Pen-level utility that operates at the `BlockHandle` / serialization layer, not the CRDT layer. Block-level diffing (compare `textContent()` + `props`) is more reliable than `Y.diffUpdate` (known bug yjs/yjs#663) and works identically across all CRDT backends:

```typescript
interface BranchDiff {
  insertedBlockIds: string[];
  deletedBlockIds: string[];
  modifiedBlockIds: string[];
}

function diffBranches(main: Editor, branch: Editor): BranchDiff;
```

**Combined branching + track changes architecture.** Branching and track changes (Section 5.5, 8.4) are complementary — branching isolates the AI's work during generation; track changes persists the diff for review after generation completes:

1. AI writes to a forked document (mechanically isolated from the user's doc).
2. On completion, `diffBranches()` identifies changed blocks.
3. Accept applies the branch diff to the main doc — either with `suggestion` marks (if suggest mode is active) or directly (if edit mode).
4. User reviews via the track changes UI or accepts the whole batch.

**Open design considerations:**

- **Streaming UX.** How the client previews branch content during generation. Two candidates: (a) a second Y.Doc on the client with decoration-based overlay rendering, or (b) a read-only projection where branch content is projected into the main document view via decorations. Both are non-trivial — the current direct-write streaming model provides real-time preview without branching.
- **Undo semantics.** Whether branch merges are non-undoable atomic commits (reversible only via version history restore, not Ctrl+Z) or can be selectively undone.
- **Mode B (client-only) memory overhead.** Two full Y.Doc instances in the browser adds memory overhead. Acceptable for the server-primary architecture (Mode A) but may be prohibitive for Mode B.
- **Multiple concurrent branches.** Natural fit for multi-generation workflows (each branch is independent), but managing N branches with M blocks of preview state scales poorly on the client. Single-branch flow ships first.

---

## 11. Streaming Architecture

The streaming layer is the nervous system of Pen — connecting LLM, tool server, and client in a real-time pipeline.

### 11.1 The Pen Document Stream Protocol

SSE-based. Typed JSON parts. Designed for document operations, not chat.

```typescript
// ── Generation Parts ─────────────────────────────────────
type GenStartPart     = { type: 'gen-start';     zoneId: string; blockId: string; }
type GenDeltaPart     = { type: 'gen-delta';     zoneId: string; delta: string; }
type GenEndPart       = { type: 'gen-end';       zoneId: string; status: 'complete' | 'cancelled' | 'error'; }

// ── Block Operation Parts ────────────────────────────────
type BlockInsertPart  = { type: 'block-insert';  blockId: string; blockType: string; props?: Record<string, unknown>; position: Position; }
type BlockUpdatePart  = { type: 'block-update';  blockId: string; props: Record<string, unknown>; }
type BlockDeletePart  = { type: 'block-delete';  blockId: string; }
type BlockMovePart    = { type: 'block-move';    blockId: string; position: Position; }

// ── Layout Parts (post-core) ─────────────────────────────
type LayoutUpdatePart = { type: 'layout-update'; blockId: string; layout: Partial<LayoutProps>; }

// ── App Parts ─────────────────────────────────────────
type AppCreatePart = { type: 'app-create'; appId: string; appType: string; config: Record<string, unknown>; placement: AppPlacement; }
type AppUpdatePart = { type: 'app-update'; appId: string; patch: Record<string, unknown>; }
type AppDeletePart = { type: 'app-delete'; appId: string; }

// ── Tool Execution Parts (AI SDK-inspired) ───────────────
type StepStartPart    = { type: 'step-start';    stepIndex: number; }
type StepEndPart      = { type: 'step-end';      stepIndex: number; }

type ToolInputStartPart     = { type: 'tool-input-start';     toolCallId: string; toolName: string; }
type ToolInputDeltaPart     = { type: 'tool-input-delta';     toolCallId: string; inputDelta: string; }
type ToolInputAvailablePart = { type: 'tool-input-available'; toolCallId: string; toolName: string; input: any; }
type ToolOutputPart         = { type: 'tool-output';          toolCallId: string; output: any; }
type ToolErrorPart          = { type: 'tool-error';           toolCallId: string; error: string; }

// ── Data Parts (reconciliation via ID) ───────────────────
type DataPart = { type: `data-${string}`; id?: string; data: any; transient?: boolean; }

// ── Control Parts ────────────────────────────────────────
type ErrorPart  = { type: 'error';  errorText: string; code?: string; }
type AbortPart  = { type: 'abort';  reason: string; }
type PingPart   = { type: 'ping'; }
type DonePart   = { type: 'done'; }
```

### 11.2 Data Part Reconciliation

From the Vercel AI SDK. When a `data-*` part has an `id`, subsequent parts with the same `id` **replace** the previous data on the client.

**Transient parts** (`transient: true`) stream to client for real-time UI but are NOT persisted.

### 11.3 Transport Abstraction

Inspired by AI SDK 5/6's transport layer. Swappable without changing editor code.

```typescript
interface PenTransport {
  stream(request: PenStreamRequest): AsyncIterable<PenStreamPart>;
  reconnect?(streamId: string): AsyncIterable<PenStreamPart>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  readonly connected: boolean;
  onConnectionChange(callback: (connected: boolean) => void): Unsubscribe;
}
```

**Bundled:**
- `@pen/transport-sse` — SSE over HTTP (default)
- `@pen/transport-direct` — In-process, no network
- `@pen/transport-ws` — WebSocket

### 11.4 Stream Processing Pipeline

Client-side: maps parts → **validate → mark dirty → normalize dirty →** CRDT write + UI state.

Every part from an external source (LLM, collaborator) passes through schema validation and normalization, then writes directly to the CRDT. Stream processing routes `gen-delta` parts through the field editor when it is active.

```typescript
function processStream(
  stream: AsyncIterable<PenStreamPart>,
  editor: Editor,
  registry: SchemaRegistry,
  streaming: StreamingTarget
) {
  for await (const part of stream) {
    switch (part.type) {
      case 'gen-start':
        streaming.beginStreaming(part.zoneId, part.blockId);
        break;
      case 'gen-delta':
        streaming.appendDelta(part.delta);
        break;
      case 'gen-end':
        streaming.endStreaming(part.status);
        break;
      case 'block-insert': {
        const schema = registry.resolve(part.blockType);
        if (!schema) {
          const fallback = registry.onUnknownBlock?.(part.blockType, part);
          if (!fallback || fallback === 'drop') break;
        }
        const validated = schema?.validateProps?.(part.props ?? {}) ?? part.props;
        editor.applyWithOrigin('ai',
          { type: 'insert-block', blockId: part.blockId, blockType: part.blockType, props: validated, position: part.position }
        );
        break;
      }
      // ... app, tool, data parts
    }
  }
}
```

### 11.5 Stream Reconnection

SSE `Last-Event-ID` for reconnection. CRDT document is source of truth — if stream events are missed, document state converges via sync regardless.

### 11.6 Batching

Token deltas accumulated 50-100ms before flushing to CRDT. Stream parts fire at token frequency for smooth UI — batching only on CRDT persistence path. Dirty-flag normalization runs inside the batch window (only the streamed block is normalized).

**Mark boundary expand enforcement on the streaming path.** `StreamingTarget.appendDelta()` writes directly to `Y.Text` on the hot path. Before each `ytext.insert()`, the delta-stream extension resolves active marks at the insert position and applies the same `InlineSchema.expand` policy as the field editor (Section 5.1, step 9). Marks with `expand: 'none'` (links, code) are excluded from the attributes argument. This prevents AI-streamed tokens from silently inheriting link or code formatting when the LLM appends text adjacent to those spans.

---

## 12. Wire Formats

Three distinct wire formats for three distinct boundaries. This is a hard architectural rule.

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│    Internal (same process)                                       │
│    ═══════════════════════                                       │
│    CRDT binary updates (Uint8Array)                              │
│    • All mutations write directly to CRDT                        │
│    • Sub-millisecond apply via binary update                     │
│    • Vector clocks + client IDs for causal ordering              │
│    • ~5× compression vs JSON                                     │
│                                                                  │
│    Sync / Collaboration (network)                                │
│    ══════════════════════════════                                 │
│    CRDT binary updates over wire (Uint8Array)                    │
│    • @pen/sync-* extensions transmit raw binary                  │
│    • CRDT merge semantics — no application-level resolution      │
│    • Incremental updates, not full snapshots                     │
│    • Transport: WebSocket, ElectricSQL, Liveblocks               │
│                                                                  │
│    Client ↔ Tool Server                                        │
│    ════════════════════                                        │
│    JSON/SSE stream parts (Section 11.1)                          │
│    • Typed document operation parts                               │
│    • Human-readable, debuggable                                   │
│    • Validated + normalized before CRDT write                    │
│                                                                  │
│    Tool Server ↔ LLM (via ModelAdapter or MCP)                │
│    ════════════════════════════════════════                    │
│    JSON tool calls                                             │
│    • Model-agnostic: any LLM client via ModelAdapter           │
│    • MCP for bidirectional protocol clients                    │
│    • Token-efficient context via format selection              │
│      on read_document (json, markdown, summary)                  │
│                                                                  │
│    Export (derived views)                                          │
│    ═════════════════════                                          │
│    HTML, Markdown, XML, JSON, Email HTML (Section 15)            │
│    • Read-only projections from CRDT document                     │
│    • Never written back directly                                  │
│    • Exporter walks BlockHandle tree                              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**No format crosses its boundary.** Binary stays internal. JSON stays on the client wire. Export formats are output-only.

**Note on token efficiency:** Pen does not include a custom token-efficient wire format (e.g., TONL) in core. Modern LLMs operate through structured tool calls, making response-format token efficiency less critical than context-window efficiency. Context reads use format selection (`read_document(format: 'json' | 'markdown' | 'summary')`) to reduce input tokens. If a custom token-efficient format proves necessary based on real-world measurements, it can be added as a `@pen/serialize-tonl` extension without changing the architecture.

---

## 13. Core

Intentionally minimal. Six internal components: Extension Manager (13.1), Tool Server (13.2), Document Pool (13.3), Schema Engine (13.4), Field Editor Host (13.5), Selection Manager (13.6).

**Default extensions.** When `createEditor()` is called without an `extensions` array, the following are included by default: `@pen/document-ops` (block CRUD), `@pen/delta-stream` (streaming protocol), and `@pen/undo` (undo/redo). When `extensions` is provided, these defaults are still included and the provided extensions are added on top. To exclude a default, use `without`:

```typescript
const editor = createEditor({
  without: ['undo'],
  extensions: [myCustomUndo()],
})
```

### 13.1 Extension Manager

Manages extension lifecycle, dependency resolution, and CRDT observation dispatch.

```typescript
interface ExtensionManager {
  register(ext: Extension): void;
  unregister(name: string): void;
  resolve(name: string): Extension | null;
  all(): readonly Extension[];

  // ── Observation ─────────────────────────────────────────
  // Dispatches CRDTEvents to all extensions' observe() hooks in dependency order.
  dispatchObserve(events: CRDTEvent[], editor: Editor): void;

  // Collects all extensions' decorations.
  collectDecorations(state: DocumentState, editor: Editor): DecorationSet;

  // Collects all extensions' input rules.
  collectInputRules(): readonly InputRule[];

  // Collects all extensions' key bindings.
  collectKeyBindings(): readonly KeyBinding[];
}
```

**Extension resolution rules:**

The `ExtensionManager` enforces dependency and conflict rules at registration time and at dispatch time.

**Dependency resolution.** Extensions are topologically sorted by `dependencies`. Circular dependencies are a hard error at registration time. Missing dependencies are a hard error — in development mode, the error message names the missing extension and the dependent that requires it; in production, the manager throws.

**Input rule conflicts.** Input rules are evaluated in extension registration order (after topological sort). First match wins. In development mode, the manager warns when two extensions register overlapping regex patterns for the same block types, because only the first will ever fire.

**Key binding conflicts.** Key bindings are evaluated by `priority` (higher first), then by registration order. The first handler that returns `true` wins. No warning is emitted — priority-based override is the intended composition mechanism. Extensions that need to intercept a binding from another extension set a higher `priority`.

**Decoration conflicts.** All extension decoration sets are merged by `collectDecorations()`. For inline decorations on the same text range, attributes are merged — later extension wins on attribute key collisions. Block decorations at the same position stack (all rendered). In development mode, the manager warns on attribute key collisions to help debug visual conflicts.

### 13.2 Tool Server & Model Integration

The tool server is Pen's internal tool registry. Extensions register tools here; the model integration layer calls them.

```typescript
interface ToolServer {
  registerTool(def: ToolDefinition): void;
  unregisterTool(name: string): void;
  listTools(): readonly ToolDefinition[];
  executeTool(name: string, input: unknown, ctx: ToolContext): Promise<unknown> | AsyncIterable<unknown>;
}

interface ToolDefinition {
  name: string;
  description: string;                 // LLM reads this
  inputSchema: JSONSchema7;            // JSON Schema 7 — universal across all LLM providers
  handler: (input: unknown, ctx: ToolContext) => Promise<unknown> | AsyncIterable<unknown>;
}
```

**`ModelAdapter` — the model integration interface.** A minimal contract that any LLM client can satisfy. One method, four event types. Pen uses it to drive the agentic tool-calling loop with document-specific invariants (undo group boundaries, generation zone lifecycle, schema validation between steps).

```typescript
interface ModelAdapter {
  stream(options: {
    messages: ModelMessage[];
    tools: ToolSchema[];           // derived from ToolServer.listTools()
    signal?: AbortSignal;
  }): AsyncIterable<ModelStreamEvent>;
}

type ModelStreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'done'; usage?: { promptTokens: number; completionTokens: number } }
  | { type: 'error'; error: unknown };

type ToolSchema = {
  name: string;
  description: string;
  inputSchema: JSONSchema7;
};
```

**AI SDK compatibility.** The `ModelAdapter` interface is deliberately shaped to align with the Vercel AI SDK's `streamText()` return type. Any AI SDK `LanguageModel` works — wrapping is trivial:

```typescript
import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'     // or any of 25+ AI SDK providers

const adapter: ModelAdapter = {
  stream: (options) => streamText({
    model: anthropic('claude-sonnet-4-6'),
    messages: options.messages,
    tools: penToolSchemas(options.tools),
    abortSignal: options.signal,
  }),
}
```

Consumers who don't use AI SDK implement the same one-method interface with whatever LLM client they prefer — raw HTTP, vendor SDKs, self-hosted models.

**Two integration paths:**

- **`ModelAdapter` (primary)** — Consumer provides any LLM client wrapped in the `ModelAdapter` interface. Pen owns the agentic loop: call model → parse tool calls → execute via `ToolServer` → feed results back → repeat. This is the path for server-side (Mode A) and client-only (Mode B) deployments where Pen drives the LLM conversation.
- **`@pen/mcp`** — MCP server (stdio, SSE, streamable HTTP). Exposes Pen's tools to external MCP clients (Claude Desktop, Cursor, etc.). The MCP client drives the conversation; Pen only executes tool calls. This is a fundamentally different pattern — bidirectional protocol, not HTTP API.

**Tool execution pipeline (server-side).** The tool server is not just a routing layer — it is the component that translates between LLM tool calls and the Pen Document Stream Protocol (Section 11.1). When the LLM calls a tool like `write_document`, the server must decide how to translate the LLM's output into typed stream parts. This pipeline is the critical bridge between Sections 11 and 16.

```
LLM calls write_document(docId, position, content, format='markdown')
    │
    ▼
ToolServer.executeTool('write_document', input, ctx)
    │
    ▼
Tool handler receives input, invokes ToolContext methods:
    │
    ├─ Content is structured blocks (format='json')
    │   → Emit block-insert parts directly per block
    │   → No parsing needed
    │
    ├─ Content is markdown (format='markdown')
    │   → Parse markdown incrementally via @pen/import-markdown
    │   → For each recognized block boundary:
    │       emit block-insert for completed blocks
    │   → For inline text within a block:
    │       emit gen-start → gen-delta (character-by-character
    │       or chunked) → gen-end
    │
    └─ Content is plain text (default)
        → emit gen-start → gen-delta → gen-end
        → Single block, pure text streaming
```

**`ToolContext` — the server-side emission interface:**

```typescript
interface ToolContext {
  readonly editor: Editor;               // headless editor instance (server-side)
  readonly docId: string;

  // ── Stream part emission ──────────────────────────────
  emit(part: PenStreamPart): void;

  // ── Convenience: structured block operations ──────────
  insertBlock(blockType: string, props: Record<string, unknown>, position: Position): string;
  updateBlock(blockId: string, props: Record<string, unknown>): void;
  deleteBlock(blockId: string): void;

  // ── Convenience: streaming text into a block ──────────
  beginStreaming(blockId: string): string;   // returns zoneId
  appendDelta(zoneId: string, text: string): void;
  endStreaming(zoneId: string, status: 'complete' | 'cancelled' | 'error'): void;
}
```

The convenience methods on `ToolContext` emit the corresponding stream parts AND apply the operations to the server-side headless editor (Mode A, Section 13.7). This keeps the server's Y.Doc in sync with what the client will receive via the stream. Tool handlers use `ToolContext` rather than constructing stream parts manually.

### 13.3 Document Pool

LRU-cached CRDT document instances. Persistence via binary-first storage interface (Section 10.1).

### 13.4 Schema Engine

Owns the SchemaRegistry (Section 4.9), runs normalization (Section 4.8), compiles schemas to framework renderers (Section 4.5), resolves layout rules (Section 4.10). The schema engine is the validation gateway — all writes to the CRDT document pass through it.

### 13.5 Field Editor Host

Manages the shared field editor lifecycle (Section 5.1). Owns activation/deactivation, cross-block expansion/contraction, delegates to block schemas for per-type editing behavior.

### 13.6 Selection Manager

Owns the `SelectionState` (Section 6), coordinates with the field editor for cross-block expansion, provides programmatic selection API, and dispatches selection changes to collaborative awareness.

### 13.7 Deployment Modes

`@pen/core` runs in both Node.js and the browser. This enables two deployment architectures:

```
Mode A — Server-side (primary)
┌──────────────────────────────┐      ┌──────────────────────────┐
│  Server                      │      │  Client (browser)        │
│                              │      │                          │
│  LLM API                    │      │  Pen editor (React)     │
│    │                        │      │    ↕                     │
│    ▼                        │      │  Y.Doc (replica)         │
│  ModelAdapter               │      │                          │
│    │                        │      └──────────┬───────────────┘
│    ▼                        │                 │
│  Headless Pen (no DOM)      │                 │
│    ↕                        │  ◄── ElectricSQL / WebSocket ──►
│  Y.Doc (source of truth)    │                 │
│    ↕                        │                 │
│  Persistence (SQLite, S3…)  │                 │
└──────────────────────────────┘
```

The LLM writes to the CRDT on the server via `ModelAdapter` → `ToolServer` → headless `createEditor()`. ElectricSQL (or a WebSocket provider) syncs the Y.Doc to all connected clients. The client Pen is just another CRDT peer — it renders and accepts user edits. **The LLM can write while the client is closed.** This is the primary architecture for production deployments.

```
Mode B — Client-only (simple setup)
┌──────────────────────────────────────────────────┐
│  Client (browser)                                │
│                                                  │
│  LLM API  ──SSE──►  processStream()             │
│                        │                         │
│                        ▼                         │
│                    StreamingTarget.appendDelta()  │
│                    editor.apply()                 │
│                        │                         │
│                        ▼                         │
│                    Pen editor (React)             │
│                        ↕                         │
│                    Y.Doc                          │
└──────────────────────────────────────────────────┘
```

No server-side Pen. The client calls the LLM API directly, receives an SSE stream, and `processStream()` maps stream parts to `editor.apply()` and `StreamingTarget` calls. Good for demos, single-user apps, or when the consumer manages their own backend.

Both modes use the same `@pen/core` package, the same `Editor` interface, the same extensions. The only difference is where the `createEditor()` instance lives and how the CRDT syncs.

---

## 14. Default Extensions

All replaceable.

### 14.1 `@pen/document-ops`
read_document, write_document, get_context, search_document, list_block_types, insert_block, update_block, delete_block, move_block. Generation zones with origin-tagged undo.

### 14.2 `@pen/apps`
App lifecycle, schema bridge, sandboxing. Sub-extensions: table, code, chart, embed, image.

**App bridge** — `defineApp()` transforms a React component into a Pen-compatible `AppSchema`:

```typescript
import { defineApp, prop } from '@pen/apps';
import { ChartComponent } from './chart';

export const chartApp = defineApp({
  type: 'chart',
  component: ChartComponent,
  configSchema: {
    data: prop.array(prop.json()).default([]).describe('Data points'),
    chartType: prop.enum(['bar', 'line', 'pie']).default('bar'),
    title: prop.string().default(''),
  },
  defaultPlacement: 'anchored',
  allowedPlacements: ['inline', 'anchored'],
  isolation: 'error-boundary',
  serialize: {
    toMarkdown: (a) => `[Chart: ${a.config.title || a.config.chartType}]`,
    toHTML: (a) => `<figure data-app="chart"><figcaption>${a.config.title}</figcaption></figure>`,
  },
  aiDescription: 'Interactive chart app. Supports bar, line, and pie charts from JSON data.',
});
```

`defineApp()` does three things:
1. Generates an `AppSchema` with validation, normalization, and sandboxing from the config schema.
2. Creates a React renderer that wraps the component with Pen's app lifecycle (loading states, config updates, placement changes, error boundary).
3. Registers the app type with the schema registry.

### 14.3 `@pen/layout` (post-core)
Layout block schemas (section, row, column, grid, stack, card). Layout primitives (Section 5.6). Layout-aware drag/drop and resize. Responsive breakpoint management.

### 14.4 `@pen/delta-stream`
The streaming extension. Owns the Pen Document Stream Protocol (Section 11.1), the stream processing pipeline (Section 11.4), transport abstraction (Section 11.3), batching, and reconnection. Routes streaming through the field editor.

### 14.5 `@pen/undo`
Undo/redo management (Section 9). Undo groups, origin tagging, field editor integration, CRDT undo manager coordination.

### 14.6 `@pen/execution`
bash, write_file, read_file, list_files, upload_to_document. Pluggable ExecutionProvider. Bundled: docker, local.

### 14.7 `@pen/skills`
list_skills, get_skill_guide, run_skill. Default: analyze-data, generate-image, format-document, export, research.

### 14.8 `@pen/ai`
Bridges tool server ↔ client. AI primitives (Section 5.5), command registry with contextual guards. Tool-specific UI rendering (AI SDK-inspired typed tool parts). Owns the agentic tool-calling loop: accepts a `ModelAdapter` (Section 13.2), calls the model, parses tool calls, executes via `ToolServer`, feeds results back, repeats — with document-specific invariants (undo group boundaries, generation zone lifecycle, schema validation) inserted between steps. Compatible with the Vercel AI SDK and any other LLM client that satisfies the `ModelAdapter` interface.

**Track changes lifecycle.** `@pen/ai` manages the persistent suggestion system:

1. **Suggest mode toggle.** When the editor enters suggest mode (`Pen.AI.TrackChanges` `data-mode='suggesting'`), the extension intercepts writes and applies `suggestion` system mark attributes instead of direct edits. Text inserts create marked `action: 'insert'` content. Text deletes mark original text with `action: 'delete'` instead of removing it.
2. **CRDT-derived decorations.** The extension's `decorations()` method reads `Y.Text` delta attributes for each mounted block. Segments with `suggestion` marks produce `InlineDecoration` objects with data attributes for consumer styling (Section 8.4). No position remapping is needed — suggestion attributes travel with their text items.
3. **Accept/reject.** Both are CRDT operations executed via `editor.apply()`: accept removes suggestion marks from inserts and deletes delete-marked text; reject removes insert-marked text and clears suggestion marks from delete-marked text. Neither depends on the undo stack.
4. **AI-originated suggestions.** When the AI writes in suggest mode (via `ToolContext` or streaming), the suggestion mark's `authorType` is `'ai'` and `model` is populated. The server can create suggestions without a connected client.
5. **Ephemeral suggestions.** Ghost text / Copilot-style completions remain client-local. The extension manages ephemeral state in `ExtensionStateSpec` and produces decorations from it. Only one ephemeral suggestion active per editor instance.

**Contextual AI command guards** (inspired by Quill's Keyboard module):

```typescript
interface AICommandBinding {
  command: string;
  handler: (editor: Editor, context: CommandContext) => void;
  context?: {
    collapsed?: boolean;
    hasSelection?: boolean;
    empty?: boolean;
    blockType?: string[];
    prefix?: RegExp;
    suffix?: RegExp;
    withinApp?: string[];
    withinLayout?: string[];
    hasApps?: boolean;
  };
}
```

### 14.9 `@pen/search`
Document search with decoration-based highlighting. Produces `InlineDecoration` for matches. Supports regex, case-sensitive/insensitive, whole-word.

### 14.10 `@pen/sync-electricsql`
SyncProvider interface. Binary-first — transmits `Uint8Array` updates over the wire. Alternatives: websocket, liveblocks, none.

### 14.11 `@pen/collaboration`, `@pen/auth`, `@pen/history`

**`@pen/collaboration`** — Collaborative editing: CRDT sync, remote user cursors and selections (decoration-based via awareness state), presence indicators. Manages the `clientID` → identity mapping in `PenDocument.metadata` (Section 10.1.1). When a new peer connects, registers its identity in the `clientIdentities` map.

**`@pen/auth`** — Authentication and authorization. Controls who can edit, suggest, accept/reject suggestions, and view version history.

**`@pen/history`** — Snapshot-based document version history and per-character attribution. Creates and manages version snapshots via the `PenPersistence` interface (Section 10.1.1). Triggers auto-snapshots before AI generation, after accept, and periodically during activity.

Provides per-character attribution by walking `Y.Text` items and mapping each item's `clientID` to the identity registered in `PenDocument.metadata`. This enables "who wrote this?" queries at character granularity without a separate audit log.

Ships with headless primitives:
- `Pen.History.Timeline` — version list with metadata, restore/preview actions.
- `Pen.History.Attribution` — per-block or per-selection author breakdown.
- `Pen.History.Diff` — visual diff between any two versions using `CRDTAdapter.restoreSnapshot()`.

Depends on: `@pen/collaboration` (for identity mapping), `@pen/core` (for `CRDTAdapter` snapshot API).

---

## 15. Export Architecture

Exporters are extensions that walk the `BlockHandle` tree and produce output in a target format. Each exporter delegates per-block serialization to `BlockSchema.serialize.toX()` but owns the document-level structure (preamble, wrapper, inter-block joining, layout translation).

```typescript
interface Exporter<Output = string> {
  name: string;
  mimeType: string;
  fileExtension: string;

  // ── Document-level export ──────────────────────────────
  export(doc: PenDocument, options?: ExportOptions): Output | Promise<Output>;

  // ── Fragment export (selection, range) ─────────────────
  exportFragment?(blocks: BlockHandle[], options?: ExportOptions): Output;
}

interface ExportOptions<Extra extends Record<string, unknown> = Record<string, never>> {
  includeApps?: boolean;       // default: true
  includeLayout?: boolean;        // default: true (false = flatten to linear)
  includeMetadata?: boolean;
  includeSuggestions?: boolean;   // default: false (export accepted content only)
  prettyPrint?: boolean;
  extra?: Extra;
}
```

**Suggestion handling in exports.** By default (`includeSuggestions: false`), exporters produce the "accepted" view of the document: text marked `suggestion.action: 'delete'` is excluded, text marked `suggestion.action: 'insert'` is included without suggestion attributes. This is the document as it would look if all pending suggestions were accepted.

When `includeSuggestions: true`:

| Exporter | Suggestion rendering |
|---|---|
| `@pen/export-markdown` | CriticMarkup syntax: `{++inserted text++}` for inserts, `{--deleted text--}` for deletes. Roundtrip: `@pen/import-markdown` recognizes CriticMarkup and recreates suggestion marks. |
| `@pen/export-html` | `<ins data-suggestion-id="..." data-suggestion-author="...">inserted</ins>` and `<del data-suggestion-id="...">deleted</del>`. Roundtrip via `@pen/import-html`. |
| `@pen/export-json` | Suggestion attributes included in inline content delta alongside other formatting attributes. Lossless roundtrip. |
| `@pen/export-xml` | `<suggestion action="insert" id="...">text</suggestion>` elements. |
| `@pen/export-email` | Suggestions are always resolved (accepted view). Email export does not support track changes markup. |

**Built-in exporters:**

| Extension | Format | Notes |
|---|---|---|
| `@pen/export-html` | HTML | Layout blocks → flex/grid divs. Apps → embedded or placeholder. |
| `@pen/export-markdown` | Markdown | CommonMark + extensions. Layout blocks unwrapped (content in tree order). Apps → text fallback. |
| `@pen/export-json` | JSON | Pen's canonical JSON format. Full block tree with props, layout, apps. Round-trips losslessly. |
| `@pen/export-xml` | XML | Generic XML representation. Schema-aware element names. |
| `@pen/export-email` | Email HTML | Inline styles, table-based layout fallbacks. *(Post-core, ships with `@pen/layout`.)* |

### 15.1 Import Architecture

Importers are the inverse of exporters: they parse external formats into Pen blocks and write them to the CRDT. While the clipboard paste pipeline (Section 5.9) handles browser-context paste, importers work everywhere — server-side, in tests, in migration scripts, and headlessly.

```typescript
interface Importer<Input = string> {
  name: string;
  mimeType: string;

  import(input: Input, editor: Editor, options?: ImportOptions): void;
}

interface ImportOptions {
  position?: Position;       // where to insert (default: 'last')
  replace?: boolean;          // replace entire document content (default: false)
  validate?: boolean;         // run schema validation (default: true)
  normalize?: boolean;        // run normalization after import (default: true)
}
```

**Import pipeline:** parse input → detect block boundaries → call `BlockSchema.serialize.fromHTML()` or `fromMarkdown()` per recognized element → fall back to paragraph for unrecognized → validate against schema registry → write to CRDT via `editor.apply()` → normalize if enabled.

**Built-in importers:**

| Extension | Input Format | Notes |
|---|---|---|
| `@pen/import-html` | HTML string | DOM parsing, maps elements to block types via schema `fromHTML()` methods. |
| `@pen/import-markdown` | Markdown string | CommonMark + extensions. Maps headings, lists, code blocks, etc. to Pen block types. |
| `@pen/import-json` | JSON | Pen's canonical JSON format. Validates schema, writes blocks directly. Round-trips with `@pen/export-json`. |

**Paste integration:** The clipboard paste pipeline (Section 5.9) uses the HTML and Markdown importers internally when processing `text/html` and `text/plain` data from the clipboard. The paste pipeline adds clipboard-specific behavior (undo grouping, selection replacement) on top of the importer's output.

---

## 16. Tool Catalog

Tools are registered through the `ToolServer` interface (Section 13.2) and automatically exposed to the active `ModelAdapter` or MCP server.

```
── Document ──────────────────────────────────────────────
read_document(docId, range?, format?)
write_document(docId, position|range, content, format?)
search_document(docId, query, options?)
get_context(docId, format?, includeSelection?)
get_cursor_context(docId)
list_block_types()
insert_block(docId, position, type, props?)
update_block(docId, blockId, props|content)
delete_block(docId, blockId)
move_block(docId, blockId, newPosition)

── Layout (post-core) ────────────────────────────────────
update_layout(docId, blockId, layoutProps)
wrap_blocks(docId, blockIds, containerType, layoutProps?)
unwrap_block(docId, containerId)

── Apps ───────────────────────────────────────────────
list_app_types()
create_app(docId, type, config, placement?)
update_app(docId, appId, config?, placement?)
read_app(docId, appId)
delete_app(docId, appId)

── Export ────────────────────────────────────────────────
export_document(docId, format, options?)

── Execution ─────────────────────────────────────────────
bash(sessionId, command) → stream
write_file / read_file / list_files / upload_to_document

── Skills ────────────────────────────────────────────────
list_skills / get_skill_guide / run_skill
```

### 16.1 Document Navigation Tools

`search_document` and `get_context` are the agent's primary navigation primitives — the document-native equivalents of `grep` and `ls`. Following the [Vercel bash-tool pattern](https://vercel.com/changelog/introducing-bash-tool-for-filesystem-based-context-retrieval), these tools give the agent good search and navigation capabilities so it can manage its own context window. No token budgets or context slicing needed.

**`search_document` returns:**

```typescript
interface SearchResult {
  blockId: string;
  blockType: string;
  snippet: string;       // ~100 chars around the match
  matchOffset: number;   // character offset within block
  matchLength: number;
  score?: number;        // relevance score for ranked results
}
```

**`get_context` formats:**

- `format: 'json'` — Full document as JSON (for small documents or targeted ranges via `range` parameter).
- `format: 'markdown'` — Full document as Markdown.
- `format: 'summary'` — Document table of contents. Returns block ID, type, and first-line preview (~50 chars) for every block. Gives the agent a navigable map of the document in ~500 tokens regardless of document size. The agent reads the summary, identifies relevant blocks, then calls `read_document` with a block range for full content.

When `includeSelection: true` is passed, `get_context` appends the current selection state to the response (cursor position, selected text, active block IDs). This gives the LLM the full picture in a single tool call.

**`get_cursor_context` — lightweight cursor/selection snapshot:**

Returns the user's current editing context without document content. Designed for fast, low-token queries when the LLM needs to know WHERE the user is, not WHAT the document contains.

```typescript
interface CursorContext {
  selection: SelectionState;
  activeBlockId: string | null;
  activeBlockType: string | null;
  selectedText: string | null;           // text content of selection, if text selection
  surroundingBlocks: {                   // ±2 blocks around cursor for local context
    id: string;
    type: string;
    preview: string;                     // first ~80 chars
  }[];
}
```

---

## 17. LLM Integration Patterns

### 17.1 Streaming Token Insertion
get_context (JSON/Markdown) → write_document → gen-start/delta/end → StreamingTarget → normalizeDirty → CRDT batch flush

### 17.2 Multi-Step Tool Loop
step-start → tool-input-start/available → tool-output → step-end (repeats) → gen-start/delta/end → done

### 17.3 Progressive Data Loading
data-*(id, loading) → data-*(id, progress) → data-*(id, complete) → app-create

### 17.4 App Placement by LLM
LLM creates apps via `create_app` tool with placement hint. Default placement comes from `AppSchema.defaultPlacement`. LLM can specify anchored placement to pin output next to the block that requested it.

### 17.5 Layout Generation by LLM (post-core)
LLM can create layout structures via `wrap_blocks` (wrap existing blocks in a row/section) or by inserting layout blocks directly with `insert_block`. Layout props use CSS flex/grid vocabulary that LLMs already understand.

### 17.6 Concurrent User and AI Editing

When an AI generation is active, the user can continue editing. The behavior depends on where the user edits relative to the generation zone.

**User edits inside the generation zone (same block or block range):** The user's writes join the generation's undo group. At the CRDT level, the `UndoManager` treats both `'user'` and `'ai'` origins within an active generation window as a single capture group. Accept keeps everything (AI output + user refinements). Reject reverts everything (AI output + user edits in that zone). This follows the Cursor/VSCode model: the user is refining the AI's output in real time, so their edits are contextually dependent on the generation.

**User edits outside the generation zone (different block):** Independent. Normal user undo group. Not affected by Accept/Reject.

**User deletes a block the AI is streaming into:** The `@pen/delta-stream` extension detects the block is gone via CRDT observation and calls `endStreaming('cancelled')`. The partial generation is part of the undo history — the user can undo the deletion to restore the block with partial AI content.

**Implementation:** During an active generation, the `UndoManager`'s `afterTransactionCleanup` checks whether the transacted block IDs overlap with the generation zone's block range. If they do, the origin is treated as part of the generation's capture group (no `stopCapturing()` boundary between them). When the generation ends, `stopCapturing()` fires, separating the combined generation+user-refinement group from subsequent edits.

---

## 18. Testing

### 18.1 `@pen/test`

Ships with M0. Enables headless testing of schemas, extensions, and document operations without a browser.

```typescript
import { createTestEditor, createTestDocument, assertDocEquals } from '@pen/test';

// ── Headless editor (no DOM) ─────────────────────────────
const editor = createTestEditor({
  schema: defaultSchema,
  extensions: [myExtension],
});

// ── Document fixtures ────────────────────────────────────
const doc = createTestDocument([
  { type: 'heading', props: { level: 1 }, content: 'Hello' },
  { type: 'paragraph', content: 'World' },
]);
editor.loadDocument(doc);

// ── Simulate operations ──────────────────────────────────
editor.apply(
  { type: 'insert-text', blockId: 'b1', offset: 5, text: ' there' }
);

// ── Assertions ───────────────────────────────────────────
assertDocEquals(editor, [
  { type: 'heading', props: { level: 1 }, content: 'Hello there' },
  { type: 'paragraph', content: 'World' },
]);

// ── Selection testing ────────────────────────────────────
editor.setSelection({ type: 'text', anchor: { blockId: 'b1', offset: 0 }, focus: { blockId: 'b1', offset: 5 } });
expect(editor.getSelectedText()).toBe('Hello');

// ── Extension state testing ──────────────────────────────
expect(editor.getExtensionState('word-count')).toBe(3);

// ── Decoration testing ───────────────────────────────────
const decorations = editor.getDecorations();
expect(decorations.forBlock('b1')).toHaveLength(0);

// ── CRDT merge scenario testing ──────────────────────────
const { editorA, editorB, sync } = createTestCollaboration({
  schema: defaultSchema,
});
editorA.apply({ type: 'insert-text', blockId: 'b1', offset: 0, text: 'A' });
editorB.apply({ type: 'insert-text', blockId: 'b1', offset: 0, text: 'B' });
sync();  // exchange CRDT updates
assertDocEquals(editorA, editorB);  // documents converge

// ── Simulate keyboard input ──────────────────────────────
editor.simulateKeypress('Mod-b');           // toggle bold
editor.simulateTyping('hello');             // type characters
editor.simulateKeypress('Enter');           // press enter
```

### 18.2 Performance Benchmarks

`@pen/bench` — shipped as dev dependency, not in the core bundle.

```typescript
import { bench } from '@pen/bench';

bench('insert 1000 blocks', async (b) => {
  const editor = createTestEditor({ schema: defaultSchema });
  b.start();
  for (let i = 0; i < 1000; i++) {
    editor.apply({
      type: 'insert-block',
      blockId: `b_${i}`,
      blockType: 'paragraph',
      props: {},
      position: i === 0 ? 'first' : { after: `b_${i - 1}` },
    });
  }
  b.end();
});

bench('normalize 500-block document', async (b) => {
  const editor = createTestEditor({ schema: defaultSchema });
  editor.loadDocument(generateLargeDoc(500));
  b.start();
  editor.normalizeAll();
  b.end();
});
```

---

## 19. Package Structure

```
pen/
├── packages/
│   ├── core/                     # Extension mgr, tool server, model adapter, doc pool,
│   │   └── src/                  # schema engine, field editor host, selection manager,
│   │       ├── extension-manager.ts    # decoration engine
│   │       ├── tool-server.ts
│   │       ├── document-pool.ts
│   │       ├── field-editor.ts
│   │       ├── selection.ts
│   │       ├── range.ts                 # DocumentRange primitive
│   │       ├── decorations.ts
│   │       ├── assets.ts                # AssetProvider interface
│   │       ├── apply.ts
│   │       ├── undo.ts
│   │       ├── schema/
│   │       │   ├── registry.ts
│   │       │   ├── normalize.ts
│   │       │   ├── handles.ts
│   │       │   ├── prop-schema.ts      # JSON Schema prop system + prop builder
│   │       │   └── layout.ts           # LayoutSchema types (impl in @pen/layout)
│   │       ├── crdt/
│   │       │   ├── adapter.ts          # CRDTAdapter interface
│   │       │   └── document.ts         # PenDocument (abstract)
│   │       ├── persistence/
│   │       ├── streaming/
│   │       └── serialization/
│   ├── crdt-yjs/                 # Yjs adapter (default)
│   ├── crdt-loro/                # Loro adapter (future)
│   ├── schema-default/           # paragraph, heading, etc.
│   ├── react/                    # primitives, hooks, renderers, field editor React impl
│   ├── test/                     # @pen/test — headless testing utilities
│   ├── bench/                    # @pen/bench — performance benchmarks
│   ├── assets-memory/            # @pen/assets-memory — in-memory asset provider (test/demo)
│   ├── transports/               # sse, ws, direct
│   ├── providers/                # mcp
│   ├── extensions/
│   │   ├── document-ops/
│   │   ├── apps/
│   │   ├── layout/               # post-core: layout blocks, primitives, drag/resize
│   │   ├── delta-stream/
│   │   ├── undo/
│   │   ├── search/               # decoration-based search
│   │   ├── export-html/ export-markdown/ export-json/ export-xml/
│   │   ├── import-html/ import-markdown/ import-json/
│   │   ├── export-email/         # post-core: ships with @pen/layout
│   │   ├── execution/ skills/
│   │   ├── ai/ collaboration/ sync-electricsql/ sync-websocket/
│   │   └── auth/ history/
│   └── cli/
├── sandbox/
├── pen.config.yaml
├── docker-compose.yaml
└── package.json
```

---

## 20. Open Questions

1. Semantic conflict resolution UX. Track changes via Y.Text attributes (Section 5.5, 8.4) addresses the suggestion/review UX for human and AI edits. Document branching (Section 10.5) addresses mechanical isolation for async AI operations. Both are partial answers — the remaining question is how to present semantic conflicts (e.g. AI rewrites a paragraph the user is actively editing) in the UI.
2. Skill marketplace / distribution.
3. Block schema versioning / migration.
4. Vue/Svelte primitive patterns and field editor implementations.
5. Rate limiting and cost attribution.
6. Offline generation queue/retry.
7. Layout responsive breakpoints — should breakpoint state live in CRDT (collaborative) or be client-local? Probably client-local. *(Deferred to @pen/layout.)*
8. Grid layout complexity budget — should `@pen/layout` expose a simplified grid API? *(Deferred to @pen/layout.)*
9. CRDT adapter performance parity — does the adapter's `raw()` escape hatch provide sufficient performance for hot-path code? Benchmark `raw<Y.Doc>()` vs direct `Y.Doc` access in M0.
10. Cross-block selection accessibility — how does the expand-on-drag model interact with screen readers? VoiceOver and NVDA need to announce the selection range correctly across block boundaries.
11. Multi-suggestion support — ephemeral suggestions remain one-at-a-time (Copilot model). Persistent suggestions (track changes) support multiple concurrent suggestions per block via unique `suggestion.id`. The remaining question: should cycling through alternatives (Zed Inline Assist pattern) be supported for ephemeral suggestions in M1, or is single-suggestion sufficient?
12. RTL / BiDi text support — the field editor (both EditContext and contenteditable backends) needs to handle bidirectional text. What is the interaction between `direction` attributes and the CRDT's text model?
13. Block metadata namespace governance — should extension metadata namespaces be registered to prevent collisions, or is convention-based naming (extension name as key) sufficient?
14. `blockOrder` / `children` invariant — can a block appear in both `blockOrder` (top-level) and as a child of another block? Presumably not. Should this invariant be enforced by normalization or by the adapter?
15. **Document branching for AI generation.** Core architecture committed in Section 10.5 (`CRDTAdapter.fork()`/`merge()`, `diffBranches()`, combined branching + track changes flow). The following sub-questions need prototyping during M2:
    - **Streaming UX.** How the client previews branch content during generation. Two candidates: second Y.Doc with decoration overlay, or read-only projection via sync. Needs prototyping.
    - **Undo semantics.** Whether branch merges are non-undoable atomic commits or can be selectively undone. Needs user testing.
    - **Mode B (client-only) overhead.** Two full Y.Doc instances in the browser. Needs measurement.
    - **Multiple concurrent branches.** Deferred until single-branch flow is proven.

---

## 21. Milestones

### M0 — Core Steel Thread
**Goal: Prove the thesis end-to-end.** A working editor with schema engine, field editor (including cross-block selection), AI streaming, undo, decorations, and React rendering.

**Ships:**
- `@pen/core` — Extension manager with CRDT observation dispatch, schema engine with normalization and registry (including system mark infrastructure, normalization rule 8 for suggestion attribute preservation, and normalization rule 9 for concurrent move-block deduplication), field editor host with cross-block expansion (single render function mandate), selection manager, `DocumentRange` primitive, decoration engine (with generation counter change detection and CRDT-derived decoration support), undo manager, `AssetProvider` interface, per-block metadata channel. `InlineSchema.expand` property defined (Peritext-inspired mark boundary semantics).
- `@pen/crdt-yjs` — Yjs adapter implementing `CRDTAdapter` including `createSnapshot`/`restoreSnapshot`/`getClientId`/`mergeUpdates`/`fork`/`merge`. `raw()` usage confined to the blast radius budget (field-editor, streaming, selection, crdt/document, history, track-changes).
- `@pen/schema-default` — Content blocks only (no layout).
- `@pen/react` — Primitives, hooks, field editor React implementation with `BlockRenderContext` (`editable` flag).
- `@pen/document-ops` — Block CRUD, generation zones, `ToolContext` server-side emission interface.
- `@pen/delta-stream` — Stream protocol, processing pipeline, transport-sse, transport-direct.
- `@pen/undo` — Undo groups, origin tagging, field editor integration.
- `@pen/mcp` — MCP tool server (default, for bidirectional protocol clients).
- `@pen/import-html` — HTML importer with sanitization (strips scripts, event handlers, embeds).
- `@pen/import-markdown` — Markdown importer for paste and document import.
- `@pen/assets-memory` — In-memory asset provider for testing and demos.
- `@pen/test` — Headless testing utilities.
- `@pen/bench` — Performance benchmarks.

**Exit criteria:** A React app with the default schema, AI streaming via MCP and via `ModelAdapter` (with any AI SDK provider), undo/redo that correctly groups AI generations, cross-block selection that works for 3+ blocks, a passing test suite run headlessly, and development-mode diagnostics for missing primitive context, schema validation fallbacks, and extension conflicts.

### M1 — AI Primitives + Collaboration
**Goal: Production-quality AI editing, track changes, version history, and basic multiplayer.**

**Ships:**
- `@pen/ai` — AI primitives (Section 5.5), contextual command guards, command registry. Track changes lifecycle: suggest mode toggle, persistent suggestion creation via `suggestion` system mark attributes on `Y.Text`, accept/reject as CRDT operations, CRDT-derived decorations for diff rendering (Section 8.4).
- `@pen/search` — Decoration-based document search.
- `@pen/sync-websocket`, `@pen/sync-electricsql` — Binary-first sync.
- `@pen/collaboration` — Collaborative cursors (decoration-based), presence. `clientID` → identity mapping in `PenDocument.metadata` for attribution.
- `@pen/history` — Snapshot-based document version history (Section 10.1.1). Auto-snapshots before/after AI generation and periodically. Per-character attribution via `clientID` mapping. `Pen.History.Timeline`, `Pen.History.Attribution`, `Pen.History.Diff` headless primitives.
- Mark boundary `expand` enforcement in field editor input backends, `StreamingTarget.appendDelta()`, and `editor.apply()` for `insert-text` ops (Section 5.1, 11.6).
- Input rules for default schema (auto-heading, auto-list, auto-divider).
- `pen create` — Scaffolding CLI with framework detection (Next.js, Vite, Remix) and template support. Templates map to quick start examples (Appendix A).
- Export suggestion handling: `includeSuggestions` option on `ExportOptions`, CriticMarkup for Markdown, `<ins>`/`<del>` for HTML. *(Defines the interface and serialization contracts; full exporter packages ship in M3, except `@pen/export-email` which ships with `@pen/layout` in M2.)*

### M2 — Layout + Apps + Execution
**Goal: Structured layout and interactive content.**

**Ships:**
- `@pen/layout` — Layout block schemas, layout primitives, drag/drop, resize. Responsive breakpoints (client-local).
- `@pen/apps` — App lifecycle, `defineApp()` bridge, sandboxing (error-boundary + iframe). Default app types.
- `@pen/execution` — Docker sandbox, bash streaming, file operations.
- `@pen/skills` — Default skills.
- `@pen/export-email` — Email HTML export with table-based layout fallbacks.
- Layout blocks added to `@pen/schema-default`.
- **Document branching prototype** (Section 10.5): the adapter API (`fork`/`merge`) and combined branching + track changes architecture are committed in the spec. M2 builds a working prototype to resolve the remaining design questions: streaming UX approach, undo semantics for branch merges, and Mode B memory overhead. Clear ship/no-ship criteria: if the streaming UX can be made responsive and the memory overhead is acceptable for Mode B, branching ships as a production feature; otherwise it remains Mode A-only or is deferred.

### M3 — Production + Ecosystem
**Goal: Production readiness and ecosystem expansion.**

**Ships:**
- `@pen/auth` — Authentication and authorization.
- Rate limiting, observability, Redis pool.
- `@pen/export-html`, `@pen/export-markdown`, `@pen/export-json`, `@pen/export-xml`.
- Additional framework renderers (Vue, Svelte).
- CLI extensions beyond `pen create` (code generation, migrations, linting).
- Field editor variants (code with syntax highlighting, plaintext).
- `@pen/crdt-loro` — Loro adapter (if Loro ecosystem is mature). Native Peritext `expand` support (input-boundary enforcement becomes no-op), native movable tree (normalization rule 9 becomes no-op), Fugue-based non-interleaving for concurrent AI + human edits.
- Documentation site.

---

## Appendix A — Quick Start Examples

Progressive examples showing how capabilities compose. Each builds on the previous. These form the basis for the `examples/` directory.

### A.1 Minimal Editor

```tsx
import { createEditor } from '@pen/core'
import { PenEditor } from '@pen/react'

const editor = createEditor()

function App() {
  return <PenEditor editor={editor} />
}
```

### A.2 Editor with Formatting Toolbar

```tsx
import { createEditor } from '@pen/core'
import * as Pen from '@pen/react'

const editor = createEditor()

function App() {
  return (
    <Pen.Editor.Root editor={editor}>
      <Pen.Toolbar.Root>
        <Pen.Toolbar.Group>
          <Pen.Toolbar.Toggle format="bold">B</Pen.Toolbar.Toggle>
          <Pen.Toolbar.Toggle format="italic">I</Pen.Toolbar.Toggle>
          <Pen.Toolbar.Toggle format="underline">U</Pen.Toolbar.Toggle>
        </Pen.Toolbar.Group>
        <Pen.Toolbar.Separator />
        <Pen.Toolbar.Select format="blockType" options={['paragraph', 'heading']} />
      </Pen.Toolbar.Root>
      <Pen.Editor.Content />
    </Pen.Editor.Root>
  )
}
```

### A.3 Editor with Slash Menu

```tsx
import { createEditor, defaultSchema } from '@pen/core'
import * as Pen from '@pen/react'

const editor = createEditor()

function App() {
  return (
    <Pen.Editor.Root editor={editor}>
      <Pen.Toolbar.Root>
        <Pen.Toolbar.Group>
          <Pen.Toolbar.Toggle format="bold">B</Pen.Toolbar.Toggle>
          <Pen.Toolbar.Toggle format="italic">I</Pen.Toolbar.Toggle>
        </Pen.Toolbar.Group>
      </Pen.Toolbar.Root>
      <Pen.Editor.Content />
      <Pen.SlashMenu.Root>
        <Pen.SlashMenu.Input placeholder="Type a command..." />
        <Pen.SlashMenu.List>
          <Pen.SlashMenu.Group heading="Basic">
            <Pen.SlashMenu.Item blockType="paragraph">Text</Pen.SlashMenu.Item>
            <Pen.SlashMenu.Item blockType="heading">Heading</Pen.SlashMenu.Item>
            <Pen.SlashMenu.Item blockType="bulletList">Bullet List</Pen.SlashMenu.Item>
            <Pen.SlashMenu.Item blockType="codeBlock">Code</Pen.SlashMenu.Item>
          </Pen.SlashMenu.Group>
          <Pen.SlashMenu.Empty>No results</Pen.SlashMenu.Empty>
        </Pen.SlashMenu.List>
      </Pen.SlashMenu.Root>
    </Pen.Editor.Root>
  )
}
```

### A.4 Editor with AI Streaming

```tsx
import { createEditor } from '@pen/core'
import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import * as Pen from '@pen/react'

const editor = createEditor()

const modelAdapter: Pen.ModelAdapter = {
  stream: (options) => streamText({
    model: anthropic('claude-sonnet-4-6'),
    messages: options.messages,
    tools: Pen.penToolSchemas(options.tools),
    abortSignal: options.signal,
  }),
}

function App() {
  return (
    <Pen.Editor.Root editor={editor} model={modelAdapter}>
      <Pen.Toolbar.Root>
        <Pen.Toolbar.Group>
          <Pen.Toolbar.Toggle format="bold">B</Pen.Toolbar.Toggle>
          <Pen.Toolbar.Toggle format="italic">I</Pen.Toolbar.Toggle>
        </Pen.Toolbar.Group>
      </Pen.Toolbar.Root>
      <Pen.Editor.Content />
      <Pen.AI.Root>
        <Pen.AI.Trigger>Ask AI</Pen.AI.Trigger>
        <Pen.AI.CommandMenu>
          <Pen.AI.CommandInput placeholder="Ask AI to write, edit, or explain..." />
          <Pen.AI.CommandList>
            <Pen.AI.CommandItem command="continue">Continue writing</Pen.AI.CommandItem>
            <Pen.AI.CommandItem command="summarize">Summarize</Pen.AI.CommandItem>
            <Pen.AI.CommandItem command="fix-grammar">Fix grammar</Pen.AI.CommandItem>
          </Pen.AI.CommandList>
        </Pen.AI.CommandMenu>
        <Pen.AI.GenerationZone>
          <Pen.AI.StreamingText />
          <Pen.AI.ActionBar>
            <Pen.AI.ActionBar.Accept>Keep</Pen.AI.ActionBar.Accept>
            <Pen.AI.ActionBar.Reject>Discard</Pen.AI.ActionBar.Reject>
            <Pen.AI.ActionBar.Retry>Retry</Pen.AI.ActionBar.Retry>
          </Pen.AI.ActionBar>
        </Pen.AI.GenerationZone>
      </Pen.AI.Root>
    </Pen.Editor.Root>
  )
}
```

**MCP variant** — for bidirectional protocol clients (Claude Desktop, Cursor, etc.) where the external client drives the conversation:

```tsx
import { createEditor } from '@pen/core'
import { mcpProvider } from '@pen/mcp'

const editor = createEditor({
  extensions: [
    mcpProvider({ url: 'http://localhost:3001/mcp' }),
  ],
})
```

### A.5 Collaborative Editor with Presence

```tsx
import { createEditor } from '@pen/core'
import { collaboration } from '@pen/collaboration'
import { websocketSync } from '@pen/sync-websocket'
import * as Pen from '@pen/react'

const editor = createEditor({
  extensions: [
    collaboration({
      user: { name: 'Alice', color: '#e06c75' },
    }),
    websocketSync({
      url: 'wss://sync.example.com',
      room: 'doc-abc-123',
    }),
  ],
})

function App() {
  return (
    <Pen.Editor.Root editor={editor}>
      <Pen.Collab.PresenceList>
        <Pen.Collab.PresenceItem />
      </Pen.Collab.PresenceList>
      <Pen.Toolbar.Root>
        <Pen.Toolbar.Group>
          <Pen.Toolbar.Toggle format="bold">B</Pen.Toolbar.Toggle>
          <Pen.Toolbar.Toggle format="italic">I</Pen.Toolbar.Toggle>
        </Pen.Toolbar.Group>
      </Pen.Toolbar.Root>
      <Pen.Editor.Content />
    </Pen.Editor.Root>
  )
}
```