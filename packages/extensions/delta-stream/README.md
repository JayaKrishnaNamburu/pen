# `@input/pen-delta-stream`

Streaming apply path for Pen. `deltaStreamExtension()` registers a `StreamingTarget` on the editor. `processStream()` consumes `PenStreamPart` values and writes them through that target.

`defaultPreset()` installs this extension. This package does not talk to a model, open a network socket, or own tool grants.

## Install

This package has no peer dependencies. `@input/pen-preset-default` already includes it.

```bash
pnpm add @input/pen-delta-stream
```

`engines.node` is `>=22`.

## Usage

```ts
import { createEditor } from "@input/pen-core";
import { deltaStreamExtension, processStream } from "@input/pen-delta-stream";

const editor = createEditor({
  extensions: [deltaStreamExtension()],
});

async function* emptyStream() {}
await processStream(emptyStream(), editor);
```

`processStream` refuses the stream and emits `stream-target-missing` when the extension is not active. It does not mint an undo `groupId`; if you omit `groupId`, each apply uses `{ origin: "ai" }` only. Mutating `tool-input-available` parts and structural stream parts (`block-insert`, `block-update`, and the other apply cases) inherit `allowedMutatingTools` (default deny). `gen-start` / `gen-delta` / `gen-end` write through the host-opened streaming target and do not consult that list.

## Options

### `deltaStreamExtension`

| Option          | Default | Effect                                        |
| --------------- | ------- | --------------------------------------------- |
| `batchInterval` | `50`    | Flush interval in milliseconds for the target |

### `processStream`

| Option                 | Default | Effect                                                                 |
| ---------------------- | ------- | ---------------------------------------------------------------------- |
| `onPart`               | none    | Called with each `PenStreamPart`                                       |
| `signal`               | none    | Abort the stream                                                       |
| `protocolVersion`      | unset   | Must equal `PEN_STREAM_PROTOCOL_VERSION` (`1`) when sent; omit to skip |
| `groupId`              | unset   | Undo group for every apply in this stream                              |
| `allowedMutatingTools` | `[]`    | Mutating tools (and equivalent structural parts) this stream may run   |

## Facets and commands

This package contributes no facets and no commands. It requires no other extensions. `processStream` looks up the document-ops tool runtime when the stream contains tool parts, and works without it when those parts are absent.

## Documentation

The docs site (the `@input/pen-docs` package) covers this area on the Extensions and facets page (`#/extensions`) and the AI features page (`#/ai`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
