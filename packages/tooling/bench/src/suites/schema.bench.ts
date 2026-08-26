import type { BenchContext, BenchDefinition } from "../bench";
import { defaultSchema } from "@input/pen-schema-default";
import { SchemaEngineImpl } from "@input/pen-core";
import { createLargeDocument } from "../fixtures/largeDoc";
import {
  SCHEMA_ALL_BLOCK_DISPLAYS_BENCH,
  SCHEMA_NORMALIZE_500_BLOCK_DOCUMENT_BENCH,
  SCHEMA_RESOLVE_X10000_BENCH,
} from "../constants/benchmarks";

export const SCHEMA_RESOLVE_COUNT = 10000;
export const SCHEMA_NORMALIZE_BLOCK_COUNT = 500;
export const SCHEMA_DISPLAY_ITERATIONS = 10000;

const RESOLVE_TYPES = [
  "paragraph",
  "heading",
  "bulletListItem",
  "codeBlock",
  "table",
  "image",
  "divider",
  "callout",
];

export function createSchemaResolveRunner(
  options: { skip?: boolean } = {},
): Pick<BenchDefinition, "fn"> {
  return {
    fn(b: BenchContext) {
      let resolveCount = 0;
      b.start();
      if (!options.skip) {
        for (let i = 0; i < SCHEMA_RESOLVE_COUNT; i++) {
          if (defaultSchema.resolve(RESOLVE_TYPES[i % RESOLVE_TYPES.length])) {
            resolveCount += 1;
          }
        }
      }
      b.end();
      b.observe("resolveCount", resolveCount, SCHEMA_RESOLVE_COUNT);
    },
  };
}

export function createSchemaNormalizeRunner(
  options: { skip?: boolean } = {},
): Pick<BenchDefinition, "fn"> {
  return {
    fn(b: BenchContext) {
      const { doc } = createLargeDocument(SCHEMA_NORMALIZE_BLOCK_COUNT);
      const penDoc = doc.penDocument;
      const engine = new SchemaEngineImpl(defaultSchema, penDoc, doc);
      let normalizeCalls = 0;

      b.start();
      if (!options.skip) {
        engine.normalizeAll();
        normalizeCalls = 1;
      }
      b.end();
      b.observe("normalizeAllCalls", normalizeCalls, 1);
      b.setMetrics({
        normalizedBlockCount: penDoc.blockOrder.length,
        normalizeAllCalls: normalizeCalls,
      });
    },
  };
}

export function createSchemaDisplaysRunner(
  options: { skip?: boolean } = {},
): Pick<BenchDefinition, "fn"> {
  return {
    fn(b: BenchContext) {
      const expectedDisplays = defaultSchema.allBlockDisplays().length;
      let displayCount = 0;
      b.start();
      if (!options.skip) {
        for (let i = 0; i < SCHEMA_DISPLAY_ITERATIONS; i++) {
          displayCount = defaultSchema.allBlockDisplays().length;
        }
      }
      b.end();
      b.observe("displayCount", displayCount, expectedDisplays);
    },
  };
}

export const schemaBenchmarks: BenchDefinition[] = [
  {
    ...SCHEMA_RESOLVE_X10000_BENCH,
    fn: createSchemaResolveRunner().fn,
  },
  {
    ...SCHEMA_NORMALIZE_500_BLOCK_DOCUMENT_BENCH,
    fn: createSchemaNormalizeRunner().fn,
  },
  {
    ...SCHEMA_ALL_BLOCK_DISPLAYS_BENCH,
    fn: createSchemaDisplaysRunner().fn,
  },
];
