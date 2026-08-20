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
import { createSSEHandler } from "@input/pen-transport-sse";

const handler = createSSEHandler({
  toolRuntime,
  onError(error) {
    console.error(error);
  },
});
```

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
