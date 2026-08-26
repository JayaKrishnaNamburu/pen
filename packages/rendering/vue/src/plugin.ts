import type { App, Plugin } from "vue";
import {
  PenBlock,
  PenContent,
  PenEditor,
  PenFieldEditor,
  PenInlineContent,
} from "./components/index";

/**
 * Registers the Pen components globally so templates can use
 * `<PenEditor>`, `<PenContent>`, `<PenBlock>`, `<PenInlineContent>`, and
 * `<PenFieldEditor>` without importing each one. Installing the plugin
 * is optional — importing the components directly works the same way.
 */
export const PenVuePlugin: Plugin = {
  install(app: App) {
    app.component("PenEditor", PenEditor);
    app.component("PenContent", PenContent);
    app.component("PenBlock", PenBlock);
    app.component("PenInlineContent", PenInlineContent);
    app.component("PenFieldEditor", PenFieldEditor);
  },
};
