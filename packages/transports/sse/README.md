# `@input/pen-transport-sse`

**Grade: reference.** This transport is single-process, non-resumable, and development-oriented. It illustrates Pen's SSE streaming protocol. Do not use it as a production collaboration or sync backend.

Resume is absent, not stubbed. `createSSEHandler` answers `GET` — with or without `Last-Event-ID` — with `405 Method Not Allowed` and `Allow: POST`. It does not return `501`. There is no replayable log, no retention bound, and no `X-Replay-Supported` header. Event `id` fields on the wire are not a replay contract. The client POSTs a fresh stream and does not send `Last-Event-ID`. A dropped connection is a full restart, not a continuation. This package does not resync document state. The handler is in-process memory only; it does not survive a process restart or a second instance.

## Install

```bash
pnpm add @input/pen-core @input/pen-transport-sse
```

## What It Provides

- `sseTransport(...)` for client-side SSE streaming
- `createSSEHandler(...)` for a server-side request handler
- shared transport types such as `SSEClientOptions` and `SSEServerOptions`

## Server Example

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { getAIToolRuntime } from "@input/pen-ai-tools";
import { createSSEHandler } from "@input/pen-transport-sse";

const editor = createEditor({
  preset: defaultPreset(),
});
const toolRuntime = getAIToolRuntime(editor);

if (!toolRuntime) {
  throw new Error("AI tools are unavailable.");
}

const handler = createSSEHandler({
  toolRuntime,
  editor,
  onError(error) {
    console.error(error);
  },
});
```

A live `Editor` is passed at construction. `PenStreamRequest` is the wire body and has no `editor` field. The handler rejects a body that is not a `PenStreamRequest` — including a top-level or nested `editor`, a wrong-shaped field, a prototype key, or an oversized payload — with `400` before any tool runs.

Mutating `toolCalls` are default-deny. Set `allowedMutatingTools` to grant specific names; an un-allowlisted mutating call emits `tool-error` and does not run the handler or apply.

## Client Example

```ts
import { sseTransport } from "@input/pen-transport-sse";

const transport = sseTransport({
  url: "https://example.com/api/stream",
  pingTimeout: 30_000,
});
```

## Integration Notes

- This package handles streaming transport concerns, not editor authority or product UI.
- The host application still owns endpoint routing, auth, headers, and server deployment. Auth is a host seam; this package does not verify requests.
- A dropped stream is not retried or resumed by this package. If the host retries, that is a new `POST`, not a continuation.
- `createSSEHandler()` can execute Pen tool-runtime requests and stream `PenStreamPart` events back to the client.

## Options

### `sseTransport`

| Option        | Default  | Effect                       |
| ------------- | -------- | ---------------------------- |
| `url`         | required | POST endpoint                |
| `headers`     | unset    | Extra request headers        |
| `pingTimeout` | `30_000` | Idle timeout in milliseconds |
| `signal`      | unset    | Abort the client stream      |

### `createSSEHandler`

| Option                 | Default  | Effect                                           |
| ---------------------- | -------- | ------------------------------------------------ |
| `toolRuntime`          | unset    | In-process tool execution                        |
| `editor`               | unset    | In-process editor for `ToolContext`              |
| `allowedMutatingTools` | `[]`     | Mutating tools the request may run. Default deny |
| `onRequest`            | unset    | Called with each `PenStreamRequest`              |
| `onError`              | unset    | Called with handler errors                       |
| `pingInterval`         | `15_000` | Server ping interval in milliseconds             |

## Documentation

The docs site (the `@input/pen-docs` package) covers this area on the AI features page (`#/ai`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
