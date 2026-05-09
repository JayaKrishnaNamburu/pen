# Headless Collaboration And AI Primitives Roadmap

## Status

Roadmap proposal for Pen library improvements that support local-first host applications, synchronized AI workflows, server-side rendering/export, and cross-client collaboration.

This document is intentionally roadmap-oriented. The rest of `spec/` remains current-state and package-centric. These waves should become package specs or package updates as they are implemented.

## Product Boundary

Pen must remain a headless, open source editor library.

Pen should provide generic primitives for:

- CRDT documents,
- collaboration state,
- structured mutation origins,
- grouped undo/update semantics,
- headless server editor construction,
- app-owned extension roots,
- export hooks,
- field adapters,
- deterministic fixtures.

Pen must not provide product-specific semantics for:

- email,
- recipients,
- subject lines,
- send/provider workflows,
- Input-specific sync tables,
- app auth,
- app model routing,
- system prompts,
- external provider secrets.

Host apps such as Input own those product concerns.

## Why This Matters

The Input Pen email architecture needs to:

- wait for a Yjs document to reach a requested state before AI/send workers run,
- apply AI edits as a single grouped mutation,
- let server workers create headless editors from YDocs,
- keep app metadata roots such as `mail` organized without raw Yjs access everywhere,
- export HTML/text through a consistent server-side pipeline,
- bind non-body CRDT fields such as subject and recipients,
- share deterministic fixtures between web and API.

Input can build these locally, but the same primitives are valuable for any app building collaborative documents, AI-assisted editing, CMS workflows, comments, notes, docs, or issue descriptions. The right move is to improve Pen generically rather than adding `toMail` or email-specific APIs.

## Cross-Wave Invariants

- `editor.apply(...)` remains the canonical document mutation path.
- Pen never owns host auth, persistence policy, transport secrets, or product workflow state.
- Renderer packages do not become document sources of truth.
- CRDT/Yjs helpers stay in `@pen/crdt-yjs` unless they become implementation-agnostic contracts.
- Export packages emit fragments/artifacts; host apps own final wrappers, sanitization policy, and delivery.
- AI helpers remain model/provider agnostic.
- All new APIs must work in headless/server environments.

## Wave Order

1. CRDT state vectors and synchronization barriers.
2. Structured mutation origins and update groups.
3. Headless editor factory and extension roots.
4. Export pipeline hooks and plain-text artifact support.
5. CRDT field adapters.
6. Deterministic fixtures, contract tests, and docs.

## Wave 1: CRDT State Vectors And Synchronization Barriers

### Wave 1 Goal

Make Yjs state-vector comparison and serialization a supported Pen capability so host apps do not hand-roll clock comparison.

### Wave 1 Package

Primary package:

```text
packages/crdt/yjs
```

Possible shared contracts:

```text
packages/types
```

### Wave 1 Public API

Add helpers like:

```ts
encodeYjsStateVector(doc): Uint8Array
encodeYjsStateVectorBase64(doc): string
decodeYjsStateVectorBase64(value): Uint8Array
isYjsStateVectorSatisfied(current, required): boolean
compareYjsStateVectors(current, required): YjsStateVectorComparison
```

Suggested result type:

```ts
type YjsStateVectorComparison = {
  satisfied: boolean;
  missingClients: Array<{
    clientId: number;
    currentClock: number;
    requiredClock: number;
  }>;
};
```

Rules:

- Decode state vectors with Yjs APIs, not ad hoc parsing.
- Missing current client clocks count as `0`.
- Extra current client IDs do not make comparison fail.
- Malformed vectors fail closed and return diagnostics.
- Base64 helpers should be explicit; do not hide binary/text conversion in unrelated APIs.

### Wave 1 Non-Goals

- Do not add Durable Streams-specific offsets to Pen.
- Do not add host workflow rows or request concepts.
- Do not add networking or waiting/polling to core state-vector helpers.

### Wave 1 Tests

- identical vectors satisfy,
- current vector with higher clocks satisfies,
- missing client fails,
- lower clock fails,
- extra current clients are ignored,
- malformed base64 fails with diagnostic,
- helpers work for empty documents,
- helpers work after applying merged updates.

### Wave 1 Input Impact

Input can replace app-local `isEmailDraftStateBarrierSatisfied(...)` internals with Pen-provided Yjs comparison while keeping the app-level helper name and workflow semantics.

## Wave 2: Structured Mutation Origins And Update Groups

### Wave 2 Goal

Make grouped mutations and origin metadata first-class enough for AI edits, undo grouping, attribution, diagnostics, and cross-client "go back" workflows.

### Wave 2 Packages

Primary packages:

```text
packages/types
packages/core
packages/crdt/yjs
packages/extensions/undo
packages/extensions/history
```

### Wave 2 Public API

Support structured origins in addition to existing string origins:

```ts
type MutationOrigin =
  | "user"
  | "ai"
  | "collaborator"
  | "input-rule"
  | {
      type: string;
      groupId?: string;
      requestId?: string;
      actorId?: string;
      source?: string;
    };
```

Add grouped apply helpers:

```ts
editor.applyGrouped(ops, {
  origin: { type: "ai", groupId, requestId },
});
```

or keep `editor.apply(...)` as the only API but standardize grouped options:

```ts
editor.apply(ops, {
  origin: { type: "ai", groupId, requestId },
  groupId,
});
```

Undo/history should preserve group metadata:

```ts
type MutationGroupMetadata = {
  groupId: string;
  originType: string;
  requestId?: string;
  actorId?: string;
};
```

### Wave 2 Rules

- Existing string origins remain supported.
- Yjs transactions should receive stable origin objects or tags that undo tracking can understand.
- Undo stack items should expose group metadata.
- History/suggestion/AI flows should not need to infer grouped mutations by timestamp.
- Group IDs are host-provided or generated by Pen helpers; they are not product-specific.

### Wave 2 Non-Goals

- Do not add Input prompt/request rows.
- Do not define model providers.
- Do not define "email AI" behavior.

### Wave 2 Tests

- string origins remain backward compatible,
- structured origins are tracked by undo manager,
- grouped AI mutation becomes one undo item,
- stack item metadata includes group ID,
- redo preserves group metadata,
- collaboration updates preserve enough metadata for diagnostics where feasible,
- history extension can filter/group by origin type.

### Wave 2 Input Impact

Input can record `applied_update_group_id` and rely on Pen to make the corresponding AI mutation one logical undoable unit.

## Wave 3: Headless Editor Factory And Extension Roots

### Wave 3 Goal

Give server workers and host apps a safe, boring path to create headless editors from CRDT documents and app-owned metadata roots.

### Wave 3 Packages

Primary packages:

```text
packages/core
packages/crdt/yjs
packages/types
```

### Wave 3 Public API

Headless editor factory:

```ts
createHeadlessEditor({
  document,
  schema,
  preset,
  documentProfile,
  extensions,
  onDiagnostic,
});
```

This can be a documented alias or wrapper around existing editor creation if the capability already exists internally. The important point is a stable server-safe entrypoint.

Extension root helpers:

```ts
ensureExtensionRoot(doc, {
  namespace: "input.mail",
  version: 1,
  shape,
});

readExtensionRoot(doc, "input.mail");
```

`shape` should be a lightweight validation/initialization contract. It should not require Pen to know host product semantics.

### Wave 3 Rules

- Extension roots are namespaced.
- Pen validates presence/version/shape at a generic level.
- Host apps own fields inside their roots.
- Helpers should avoid raw `Y.Map` access leaking through product code.
- Headless editor construction must not require DOM or renderer packages.

### Wave 3 Non-Goals

- Do not add a built-in `mail` root.
- Do not add recipient/subject concepts.
- Do not add server transport policy.

### Wave 3 Tests

- headless editor can be constructed from a wrapped YDoc,
- missing Pen roots are initialized or diagnosed according to options,
- extension root initialization is idempotent,
- version mismatch produces diagnostic,
- root helpers do not mutate unrelated roots,
- headless editor can export after construction.

### Wave 3 Input Impact

Input's API workers can load a YDoc, ensure Pen roots and the `input.mail` extension root, then create a headless editor for AI/export without custom bootstrapping in every worker.

## Wave 4: Export Pipeline Hooks And Plain-Text Artifacts

### Wave 4 Goal

Make export more composable for host-defined targets such as web previews, markdown, plain text, and product-specific delivery formats while keeping Pen responsible only for document fragments/artifacts.

### Wave 4 Packages

Primary packages:

```text
packages/extensions/export-html
packages/extensions/export-markdown
packages/core
packages/types
```

Possible new package:

```text
packages/extensions/export-text
```

### Wave 4 Public API

Extend export options generically:

```ts
type ExportOptions<Extra = unknown> = {
  includeSuggestions?: boolean;
  target?: string;
  hooks?: ExportHooks;
  extra?: Extra;
};
```

Hooks:

```ts
type ExportHooks = {
  block?: (context) => string | undefined;
  inline?: (context) => string | undefined;
  asset?: (context) => ExportAsset | undefined;
  afterBlock?: (context) => string | undefined;
};
```

Suggestion policy:

```ts
type SuggestionExportMode =
  | "raw"
  | "resolved"
  | "accepted-only"
  | "rejected-only";
```

Plain-text artifact:

```ts
exportPlainText(editor, options): string
```

### Wave 4 Rules

- HTML exporter still returns fragments, not full delivery documents.
- Host apps own wrappers, CSS inlining, sanitization, provider quirks, and final delivery.
- Export hooks must be deterministic and side-effect free.
- Traversal must include nested/layout children.
- Defaults must preserve current output.

### Wave 4 Non-Goals

- Do not implement `toMail`.
- Do not add host delivery compatibility policy to Pen.
- Do not sanitize final host output in Pen unless a generic sanitizer package is explicitly introduced.

### Wave 4 Tests

- current HTML snapshots remain stable by default,
- `target` is passed to block/inline hooks,
- host block override works without modifying schema,
- suggestion export modes behave consistently,
- plain text traversal includes nested children,
- database/table export still works,
- unknown target falls back safely.

### Wave 4 Input Impact

Input can use Pen for stable fragment/text export while keeping mail wrappers, quote handling, footer insertion, and sanitization inside Input.

## Wave 5: CRDT Field Adapters

### Wave 5 Goal

Provide generic adapters for non-body CRDT fields such as titles, labels, tags, recipients-like arrays, and app-owned structured fields.

### Wave 5 Packages

Primary package:

```text
packages/crdt/yjs
```

Possible shared contracts:

```text
packages/types
```

### Wave 5 Public API

Text field adapter:

```ts
createYTextFieldAdapter({
  doc,
  root,
  key,
  normalize?,
});
```

Array/map field adapter:

```ts
createYArrayFieldAdapter<T>({
  doc,
  root,
  key,
  itemSchema,
  getId,
  normalizeItem?,
});
```

Returned capabilities:

```ts
read()
replace(value)
insert(item, index?)
update(id, patch)
remove(id)
observe(callback)
```

### Wave 5 Rules

- Adapters are generic CRDT helpers, not form components.
- They should work in browser and server.
- They should support stable item IDs.
- They should keep normalization optional and host-provided.
- They should not know about recipients, subject, email addresses, or contacts.

### Wave 5 Non-Goals

- Do not add UI bindings to core adapters.
- Do not add app validation rules.
- Do not add schema-default fields.

### Wave 5 Tests

- Y.Text field reads/writes/observes,
- array adapter inserts/removes by stable ID,
- concurrent item updates do not replace the whole array,
- normalization is applied consistently,
- server-side use works without DOM,
- malformed item data emits diagnostics or fails safely.

### Wave 5 Input Impact

Input can bind subject and recipient arrays through generic field adapters instead of custom Yjs wrappers.

## Wave 6: Deterministic Fixtures, Contract Tests, And Docs

### Wave 6 Goal

Make headless CRDT/editor/export behavior easy to test across host apps and Pen packages.

### Wave 6 Packages

Primary packages:

```text
packages/tooling/test
packages/crdt/yjs
packages/core
```

### Wave 6 Public API

Fixture helpers:

```ts
createDeterministicYDocFixture(...)
encodeFixtureUpdate(...)
normalizeDocumentForSnapshot(...)
assertDocumentRoots(...)
```

Contract test helpers:

```ts
runCRDTStateVectorContract(...)
runHeadlessEditorContract(...)
runExportContract(...)
```

### Wave 6 Rules

- Fixtures must avoid real personal data.
- Helpers must be deterministic.
- Helpers should be usable by host apps without private Pen internals.
- Contract tests should be opt-in and package-friendly.

### Wave 6 Non-Goals

- Do not create Input-specific fixtures in Pen.
- Do not require host apps to use Pen's test runner.
- Do not encode product-specific expected outputs.

### Wave 6 Tests

- deterministic fixture generation is stable,
- normalized snapshots are stable across clients,
- contract helpers can run in Node,
- malformed fixture helpers produce useful diagnostics.

### Wave 6 Input Impact

Input's `spec/fixtures/email-drafts/` can use Pen fixture tooling to create stable YDoc updates and verify projection/export/state-barrier behavior across web and API.

## Documentation Updates

As waves ship, update:

- `spec/packages/crdt/yjs.md`,
- `spec/packages/core.md`,
- `spec/packages/extensions/export-html.md`,
- `spec/packages/extensions/ai.md`,
- package READMEs,
- playground examples where helpful.

Examples should stay generic:

- collaborative title/body document,
- AI rewrite with grouped undo,
- headless server export,
- extension root for app metadata,
- field adapter for tags or labels.

Do not use a mail workflow as the primary Pen example unless it is clearly framed as a host-app pattern outside core Pen semantics.

## Rollout Guidance

Recommended order for Input alignment:

1. Ship Wave 1 before Input implements state barriers.
2. Ship Wave 2 before Input finalizes AI go-back semantics.
3. Ship Wave 3 before Input builds API AI/send workers.
4. Ship Wave 4 before Input locks server export.
5. Ship Wave 5 before Input builds custom subject/recipient Yjs adapters, if timing allows.
6. Ship Wave 6 when Input begins shared fixture work.

Input can proceed with local wrappers if a Pen wave is not ready, but those wrappers should mirror the proposed Pen API so they can collapse back into the library later.
