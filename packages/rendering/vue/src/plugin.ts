import type { App, Plugin } from "vue";
import {
  PenBlock,
  PenContent,
  PenEditor,
  PenFieldEditor,
  PenInlineContent,
} from "./components/index";

export const PenVuePlugin: Plugin = {
  install(app: App) {
    app.component("PenEditor", PenEditor);
    app.component("PenContent", PenContent);
    app.component("PenBlock", PenBlock);
    app.component("PenInlineContent", PenInlineContent);
    app.component("PenFieldEditor", PenFieldEditor);
  },
};
