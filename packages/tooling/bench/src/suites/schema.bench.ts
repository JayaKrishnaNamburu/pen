import type { BenchContext } from "../bench";
import { defaultSchema } from "@pen/schema-default";
import { SchemaEngineImpl } from "@pen/core";
import { createLargeDocument } from "../fixtures/large-doc";

export const schemaBenchmarks: Array<{
  name: string;
  fn: (b: BenchContext) => void | Promise<void>;
}> = [
  {
    name: "schema resolve x10000",
    fn(b) {
      const types = [
        "paragraph",
        "heading",
        "bulletListItem",
        "codeBlock",
        "table",
        "image",
        "divider",
        "callout",
      ];

      b.start();
      for (let i = 0; i < 10000; i++) {
        defaultSchema.resolve(types[i % types.length]);
      }
      b.end();
    },
  },
  {
    name: "normalize 500-block document",
    fn(b) {
      const { doc, adapter } = createLargeDocument(500);
      const penDoc = (doc as any).penDocument;
      const engine = new SchemaEngineImpl(defaultSchema, penDoc, doc);

      b.start();
      engine.normalizeAll();
      b.end();
    },
  },
  {
    name: "allBlockDisplays (slash menu population)",
    fn(b) {
      b.start();
      for (let i = 0; i < 10000; i++) {
        defaultSchema.allBlockDisplays();
      }
      b.end();
    },
  },
];
