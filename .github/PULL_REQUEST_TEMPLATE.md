## Summary

<!-- What changed and why. -->

## Spec

<!-- Rule IDs this PR implements or amends (`DOC5`, `SM3`, `ST5`, …). Blank if none. -->

## Checklist

- [ ] `pnpm verify` passes locally (runs the same gates CI does, minus the browser suites)
- [ ] Changeset (`pnpm changeset`) if a published package's behavior or public API changed
- [ ] Spec rule IDs listed above; tests that claim those IDs include the ID in the test name
- [ ] No new slots (`*_SLOT` / `setSlot` outside the adapter)
- [ ] No pipeline bypass: durable writes go through `editor.apply` (or `openTextStream`); no direct `Y.Text` / `Y.Map` writes or `adapter.transact` outside `@input/pen-core`
