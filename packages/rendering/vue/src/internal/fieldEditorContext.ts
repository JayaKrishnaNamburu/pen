import { FieldEditorImpl } from "@pen/dom";
import type { FieldEditorStore } from "@pen/dom/field-editor/store";
import { inject, provide, type InjectionKey } from "vue";

export type VueFieldEditor = FieldEditorImpl & FieldEditorStore;

const FIELD_EDITOR_CONTEXT_KEY: InjectionKey<VueFieldEditor | null> =
  Symbol("pen-vue-field-editor-context");

export function provideFieldEditorContext(
  fieldEditor: VueFieldEditor | null,
): void {
  provide(FIELD_EDITOR_CONTEXT_KEY, fieldEditor);
}

export function useFieldEditorContext(): VueFieldEditor | null {
  return inject(FIELD_EDITOR_CONTEXT_KEY, null);
}
