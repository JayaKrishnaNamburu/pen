# `@pen/assets-memory`

In-memory asset provider for Pen.

## Install

```bash
pnpm add @pen/assets-memory
```

## What It Provides

- `memoryAssets()` to create an in-memory `AssetProvider`
- upload, resolve, and delete behavior backed by a local object store
- object-URL based asset refs for local development and tests

## Usage

```ts
import { memoryAssets } from "@pen/assets-memory";

const assets = memoryAssets();

const ref = await assets.upload(new Blob(["hello"], { type: "text/plain" }), {
  mimeType: "text/plain",
});

const url = assets.resolve(ref);
await assets.delete(ref);
```

## Integration Notes

- This provider is useful for tests, demos, and local playground flows.
- It is not intended to be a durable production storage layer.
- Uploaded refs are kept in memory for the lifetime of the provider instance.
