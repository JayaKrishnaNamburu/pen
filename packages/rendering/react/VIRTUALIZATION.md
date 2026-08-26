# SCALE5 host virtualization

Pen does not window blocks. Windowing is a host concern (`spec/rules/scale.md` SCALE5, `spec/rules/dom.md`). `EditorContent` and `PenEditor` have no `virtualize` prop.

## Contract

- **Unmount is allowed.** A host may omit any block that does not hold the active field editor or an active selection endpoint. Document state is untouched. Decorations are still computed; they are not rendered.
- **Remount does nothing.** The host must not rehydrate, replay, or patch the remounted block. Reconciliation is idempotent.
- **`selection-target-unmounted` is a future diagnostic.** When selection targets an unmounted block, the scheduler's projection retry is the current recovery. The warning is specified (`spec/rules/reliability.md`) and is not emitted yet.

A windowed conformance fixture is still outstanding.
