# Pen playground

A small, complete Pen app: an editor in the middle, an AI agent on the left, and
a live view of the document on the right.

It is meant to be read as much as run. Every file is short and does one thing,
and there is no state management library, CSS framework, or component kit in the
way — just React, plain CSS, and Pen.

## Run it

```bash
pnpm install
pnpm build        # the playground imports the built packages
pnpm --filter @input/pen-playground dev
```

Open http://localhost:5173. The agent works immediately: with no API key a
scripted model answers, so you can see the whole path without signing up for
anything.

For real answers, open the agent's ⋯ menu and paste an Anthropic API key.
It stays in this browser. Or write it to `playground/.env.local` and restart:

```bash
echo 'ANTHROPIC_API_KEY=sk-ant-...' > playground/.env.local
```

While hacking on Pen itself, run `pnpm build --watch` (or rebuild the package you
are changing) so the playground picks it up.

## What is where

```
src/
  App.tsx              three panes over one editor
  editor/              the editor: setup, toolbar, slash menu, starter document
  chat/                the agent: transcript, composer, and the hook behind them
  inspector/           the document-state sheet
  collaboration/       optional live rooms: name, room, Yjs session
  ai/                  model adapter and the browser-saved API key
  ui/                  the interface primitives (see below)
  styles/tokens.css    every colour, size, and radius in the app
server/
  aiPlugin.ts          serves /api/chat from the Vite dev server
  collaborationPlugin.ts  Yjs websocket at /collaboration
  chatRoute.ts         the endpoint: pick a model, stream the reply
  anthropicModel.ts    real model
  scriptedModel.ts     offline model, used when there is no API key
  protocol.ts          the four events that cross the wire
```

## The UI layer

`src/ui/` holds ten primitives — button, tile, select, tooltip, badge, scroll
area, tabs, sheet, modal, dropdown — plus the icon set, the 3×3 agent loader,
and one stylesheet. They are simplified ports of
[Input](https://www.input.so)'s design system, which is where the look comes from:
quiet surfaces, hairline borders, pill buttons whose hover fill grows into place,
tooltips that carry the key binding, cards with a shadow instead of a border, and
a status line that shimmers while the agent works.

The compound shapes are Input's, because they are what makes the call sites
short: `Button.Icon` for a square icon button, `Button.Tooltip` to label one,
`Tile.Button` for a card you can click.

Simplified means genuinely smaller. Input's button carries kinds, shapes, loading
states, and a keybinding registry across 620 lines; this one is 90 and drops the
registry. Its tooltip is a Radix popper with collision handling and lazy mounting
because it renders thousands in a list; this one is a span shown by CSS. Its
icons animate through Framer Motion; these use CSS keyframes.

Each file names what it dropped and why, so it is clear which parts were
essential and which were scale.

## Three things worth understanding

**One editor, three views.** `App.tsx` creates a single `Editor` and hands it to
all three panes. The chat does not send text to the editor and the inspector does
not receive copies of the document — they both talk to the editor directly, which
is why they never disagree.

**Every change is a document operation.** Typing, the slash menu, undo, and the
agent all end up in `editor.apply(ops)`. `editor/starterDocument.ts` is the
shortest example: it seeds the document with a handful of ops. Open the inspector
and watch the revision counter move as you type.

**The agent answers in document content, not chat prose.** This is the part
that surprises people. Pen routes each prompt — rewrite the selection, continue
at the cursor, or run a tool loop — and the answer arrives either as text
streamed into a block or as tool calls that Pen applies. Nothing comes back for
the sidebar to print, so the sidebar keeps a receipt of what changed and names
the route Pen chose. `server/scriptedModel.ts` shows both shapes: it calls
`write_document` when Pen offers tools, and streams a paragraph when it does not.

## Making it yours

- **Restyle it** — edit `styles/tokens.css`; every primitive and every feature
  stylesheet reads from it. Pen's React primitives ship no styles of their own;
  they expose state as `data-*` attributes, and `editor/editor.css` hangs plain
  CSS off those.
- **Add a block type** — `editor/penEditor.ts` uses `defaultPreset()`, which
  supplies the default schema; pass your own schema to `createEditor` to extend
  it. The toolbar's block-type dropdown and the slash menu both build themselves
  from the schema, so a new block type shows up in each with no further wiring.
- **Add an extension** — the `extensions` array in `editor/penEditor.ts`. Search
  is one package away. Multiplayer is already wired through the collaborate
  button in the top bar.
- **Use a different model** — `ai/penModel.ts` is a `ModelAdapter`: an async
  generator of events. Point it anywhere, or drop the server and call a provider
  from the browser.

## Not in here

Image uploads, comments, and tables beyond the basics. This app stays small on
purpose; the examples and package tests cover the rest.
