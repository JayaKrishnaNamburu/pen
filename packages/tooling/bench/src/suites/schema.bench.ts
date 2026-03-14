import type { BenchContext, BenchDefinition } from "../bench";
import { defaultSchema } from "@pen/schema-default";
import { SchemaEngineImpl } from "@pen/core";
import { createLargeDocument } from "../fixtures/largeDoc";
import {
  SCHEMA_ALL_BLOCK_DISPLAYS_BENCH,
  SCHEMA_NORMALIZE_500_BLOCK_DOCUMENT_BENCH,
  SCHEMA_RESOLVE_X10000_BENCH,
} from "../constants/benchmarks";

export const schemaBenchmarks: BenchDefinition[] = [
  {
    ...SCHEMA_RESOLVE_X10000_BENCH,
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
    ...SCHEMA_NORMALIZE_500_BLOCK_DOCUMENT_BENCH,
    fn(b) {
      const { doc } = createLargeDocument(500);
      const penDoc = doc.penDocument;
      const engine = new SchemaEngineImpl(defaultSchema, penDoc, doc);

      b.start();
      engine.normalizeAll();
      b.end();
    },
  },
  {
    ...SCHEMA_ALL_BLOCK_DISPLAYS_BENCH,
    fn(b) {
      b.start();
      for (let i = 0; i < 10000; i++) {
        defaultSchema.allBlockDisplays();
      }
      b.end();
    },
  },
];
