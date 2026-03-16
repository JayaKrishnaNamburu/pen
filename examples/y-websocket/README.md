# Yjs WebSocket Example

This folder shows the recommended way to wire Pen collaboration to [`y-websocket`](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket).

Pen owns editor-facing multiplayer state.
`y-websocket` owns transport, reconnect, cross-tab sync, and Yjs protocol behavior.

## Install in your app

```bash
pnpm add y-websocket
```

## Example helper

`createYWebsocketSessionFactory.ts` exports a copy-pasteable helper that adapts `WebsocketProvider` into Pen's `MultiplayerSession` contract.

## Usage

```ts
import { createEditor } from "@pen/core";
import { multiplayerExtension } from "@pen/multiplayer";

import { createYWebsocketSessionFactory } from "./createYWebsocketSessionFactory";

const editor = createEditor({
  extensions: [
    multiplayerExtension({
      user: { id: "u1", name: "Ada" },
      sessionFactory: createYWebsocketSessionFactory({
        serverUrl: "ws://localhost:1234",
        room: "room-a",
      }),
    }),
  ],
});
```

## Why this is the preferred setup

- `@pen/multiplayer` stays transport-agnostic.
- `@pen/crdt-yjs` only exposes Yjs interop helpers.
- the application can swap `y-websocket` for another provider later without changing Pen's multiplayer core.

## Notes

- The helper uses `connect: false` so Pen controls the session lifecycle through `multiplayerExtension()`.
- `getStatus()` and `getIsSynced()` are included so Pen can reflect the correct initial state even if the provider is already active when wrapped.
