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
import { directTransport } from "@input/pen-transport-direct";

const transport = directTransport({
  toolRuntime,
  onError(error) {
    console.error(error);
  },
});
```

## Integration Notes

- This transport requires a Pen `toolRuntime` in the same process.
- It is not a collaboration or sync backend.
- When the tool runtime lives outside the current process, use another transport. `@input/pen-transport-sse` is also reference-grade — single-process, non-resumable, and development-oriented — not a production backend.
