# `@input/pen-multiplayer`

Headless collaboration primitives for Pen.

This package owns editor-facing multiplayer behavior:

- local awareness publishing
- peer derivation
- remote cursor and selection state
- controller state
- multiplayer decorations

It does **not** own transport, reconnect, auth, or Yjs wire protocol behavior.

## Presence is host-provided and untrusted

`config.user` (and any other awareness fields the host publishes) is **host-provided and visible to every peer**. Do not put an email, internal id, or other secret in presence unless it is meant to be broadcast.

## COL2: Awareness is validated on read

Pen treats remote awareness as untrusted input. One validator owns the payload and runs **on receipt**, before any peer state reaches identity, decorations, or the author ledger. Local state is published as-is; peers validate what they receive.

**Hostile or invalid presence is ignored.** That peer degrades to invisible. The document is unchanged. Pen emits a `presence-rejected` diagnostic (`PRESENCE_REJECTED_CODE`) with a reason. One bad peer never breaks the others.

| Reason | When |
| --- | --- |
| `oversized` | A string or the whole payload exceeds a bound |
| `wrong-typed` | Invalid shape or type, or a forbidden key (`__proto__`, `constructor`, `prototype`) |
| `script-bearing` | Script/markup in a string, or a hostile avatar scheme |
| `nonexistent-block` | Cursor or selection names a block that is not in the local document |
| `out-of-range-offset` | Offset is outside the block |
| `rate-limited` | More than `MAX_PRESENCE_UPDATES_PER_SECOND` updates from that peer |
| `peer-cap` | Extra peers past `MAX_TRACKED_PEERS` |

A bad `user` drops the whole peer. A bad cursor or selection is dropped for that field only; a valid user can still appear. Cursor and selection ranges are resolved against the local document — a nonexistent block is not rendered. Undeclared keys are ignored: hosts may carry their own presence data, and Pen never interprets it.

### Peer cap and rate limit

- **Rate limit.** After `MAX_PRESENCE_UPDATES_PER_SECOND` accepted updates from a peer in a one-second window, further updates are ignored and that peer keeps its last accepted state.
- **Peer cap.** After `MAX_TRACKED_PEERS` remote peers, extra peers are counted (`untrackedPeerCount` on the diagnostic) and not rendered. The document does not degrade.

| Bound | Constant | Default |
| --- | --- | --- |
| Display name | `MAX_PRESENCE_DISPLAY_NAME_LENGTH` | 64 |
| User id | `MAX_PRESENCE_USER_ID_LENGTH` | 128 |
| Avatar URL | `MAX_PRESENCE_AVATAR_URL_LENGTH` | 2048 |
| Color | `MAX_PRESENCE_COLOR_LENGTH` | 64 |
| Awareness bytes per peer | `MAX_PRESENCE_BYTES_PER_PEER` | 4096 |
| Block ids per block selection | `MAX_PRESENCE_BLOCK_SELECTION_IDS` | 256 |
| Updates per second per peer | `MAX_PRESENCE_UPDATES_PER_SECOND` | 10 |
| Tracked peers per document | `MAX_TRACKED_PEERS` | 32 |

Avatar URLs use the same admission rules as image URLs: `http:`, `https:`, relative, and `data:image` for png/jpeg/gif/webp/avif. Hostile schemes are rejected as `script-bearing`.

Remote cursor `data-user-id` / `data-user-name` are set as attribute values; the display name is capped and rendered as text, never interpolated into markup.

## Identity is host-owned

The host owns identity. Peer-asserted `user.id` / `user.name` are unverified display hints for live carets, not authorship.

- `config.user` is what this client publishes. Every peer will see it.
- `resolvePeerIdentity` is the host seam for mapping a `clientId` to an identity the host has verified.
- Attribution in `@input/pen-history` does not treat awareness names as authors. Without a host `resolveAuthor`, blame shows an opaque client handle (`User 77`), never a peer-supplied name.

## Design

`@input/pen-multiplayer` is built around a small session interface from `@input/pen-types`:

```ts
export interface MultiplayerSession {
  readonly connectionState: ConnectionState;
  connect(): void;
  disconnect(): void;
  destroy(): void;
  onStateChange(listener: (state: ConnectionState) => void): Unsubscribe;
}
```

The extension accepts either a ready-made session or a `sessionFactory`:

```ts
import { multiplayerExtension } from "@input/pen-multiplayer";

multiplayerExtension({
  user: { id: "u1", name: "Ada" },
  session,
});
```

```ts
import { multiplayerExtension } from "@input/pen-multiplayer";

multiplayerExtension({
  user: { id: "u1", name: "Ada" },
  sessionFactory: ({ editor, awareness }) => {
    return session;
  },
});
```

## Recommended setup

If you are using Yjs, prefer:

- `@input/pen-multiplayer` for the multiplayer extension and controller state
- `@input/pen-crdt-yjs` for Yjs integration helpers
- an external provider such as [`y-websocket`](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket) for transport

That keeps Pen transport-agnostic and lets the application choose its own provider model.

## Example

See `@input/pen-crdt-yjs` for the canonical `y-websocket` integration example using:

- `getYjsDoc()`
- `getYjsAwareness()`
- `createYjsProviderSession()`

For a concrete repository reference, see the playground collaboration wiring in
`playground/src/utils/playgroundCollaboration.ts`.
