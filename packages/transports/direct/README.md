# `@pen/transport-direct`

In-process transport for Pen.

## Install

```bash
pnpm add @pen/core @pen/transport-direct
```

## What It Provides

- `directTransport(...)` for in-process tool execution without a network hop
- `DirectTransportOptions` for wiring a `toolRuntime` and optional error handling

## Usage

```ts
import { directTransport } from "@pen/transport-direct";

const transport = directTransport({
  toolRuntime,
  onError(error) {
    console.error(error);
  },
});
```

## Integration Notes

- This transport requires a Pen `toolRuntime`.
- It is useful for local agent loops, embedded runtime execution, and tests where the host app and tool runtime live in the same process.
- Use `@pen/transport-sse` or another external transport when the tool runtime lives outside the current process.
