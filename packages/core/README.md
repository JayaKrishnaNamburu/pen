# @pen/core

Headless editor runtime for Pen.

This package is published publicly, but the Pen SDK is source-available rather than OSI open source. Production use requires a license from Input.

## Install

```bash
pnpm add @pen/core
```

## What It Provides

- `createEditor(...)` to create editor instances
- document state, selection, normalization, and mutation orchestration
- the canonical `editor.apply(...)` document mutation boundary

## Typical Pairing

Most apps use `@pen/core` with:

- `@pen/preset-default`
- `@pen/react` or `@pen/vue`

See the repository root README for the broader package map and licensing details.
