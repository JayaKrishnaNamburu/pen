# Architecture

## Purpose

Define the durable architecture rules that apply across the Pen monorepo.

## Core Model

Pen is a headless, extension-first editor engine. The document model, mutation pipeline, selection model, and extension system live independently from renderer packages such as React and Vue.

## Layering

- `@input/pen-types` owns contracts and lightweight shared helpers.
- `@input/pen-core` owns editor authority, document state, normalization, selection, extensions, and the canonical mutation pipeline.
- Schema packages define block and inline surfaces.
- Extension packages add optional runtime behavior such as AI, search, undo, multiplayer, input rules, and interchange (`@input/pen-interop`).
- `@input/pen-dom` owns the framework-neutral browser editing engine, including field-editor sessions, DOM selection bridging, clipboard flows, text-entry target detection, and shared document-keyboard behavior.
- Rendering packages bind the headless runtime and DOM editing engine to framework-native component, hook, or composable systems.
- Tooling and app packages support development, testing, docs, and examples.

## Rules

- Runtime writes go through `editor.apply(...)`.
- Extensions are the feature composition model.
- Renderer packages do not become alternate sources of document truth.
- Shared browser editing behavior belongs in `@input/pen-dom`; React and Vue should delegate to it instead of carrying framework-local keyboard, selection, or table-editing forks.
- Host applications own auth, transport policy, and product-specific UI decisions.
- Shared helpers should stay below package boundaries rather than leaking renderer or app assumptions into the core.
- `@input/pen-content-ops` and `@input/pen-markdown-serialization` depend on `@input/pen-core` and re-export helpers that moved there. Core no longer depends on those packages.
- `defaultPreset()` is the batteries-included composition. Bare `createEditor()` is the apply pipeline only: no schema, no extensions.
- `pen.ariaReadOnly` (the facet) and the renderer `readonly` prop are not the same switch. The facet sets `aria-readonly`. The prop is what declines local typing. That split is shipped and is an open owner decision; do not collapse them in this spec.
