# `@input/pen-transport-direct`

**Grade: development-only.** This is a single-process, in-process only, no-network transport for tests and demos. It never opens a socket and cannot reach a runtime in another process. It is non-resumable: there is no stream history and nothing to reconnect. Do not ship it.

## Install

```bash
pnpm add @input/pen-core @input/pen-transport-direct
```

## What It Provides

- `directTransport(...)` for in-process tool execution without a network hop
- `DirectTransportOptions` for wiring a `toolRuntime` and optional error handling

## Usage

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { getAIToolRuntime } from "@input/pen-ai-tools";
import { directTransport } from "@input/pen-transport-direct";

const editor = createEditor({
  preset: defaultPreset(),
});
const toolRuntime = getAIToolRuntime(editor);

if (!toolRuntime) {
  throw new Error("AI tools are unavailable.");
}

const transport = directTransport({
  toolRuntime,
  editor,
  onError(error) {
    console.error(error);
  },
});
```

A live `Editor` is passed at construction. It is not a field on `PenStreamRequest` — that type is the wire shape, and direct does not smuggle a handle through it.

## Options

| Option        | Default | Effect                                                         |
| ------------- | ------- | -------------------------------------------------------------- |
| `toolRuntime` | none    | Required at runtime. `directTransport` throws if it is omitted |
| `editor`      | unset   | In-process editor handed to `ToolContext.editor`               |
| `onError`     | unset   | Called with tool-execution errors                              |

## Documentation

The docs site (the `@input/pen-docs` package) covers this area on the AI features page (`#/ai`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
