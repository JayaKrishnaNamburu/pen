import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PASTE_CORPUS_SOURCE_IDS,
  type PasteCorpusExpectation,
  type PasteCorpusFixture,
  type PasteCorpusSourceId,
} from "./types";

const corpusDir = dirname(fileURLToPath(import.meta.url));

export function loadPasteCorpusFixture(
  id: PasteCorpusSourceId,
): PasteCorpusFixture {
  const dir = join(corpusDir, id);
  return {
    id,
    html: readFileSync(join(dir, "clipboard.html"), "utf8"),
    plain: readFileSync(join(dir, "plain.txt"), "utf8"),
    expectation: JSON.parse(
      readFileSync(join(dir, "expectation.json"), "utf8"),
    ) as PasteCorpusExpectation,
  };
}

export function loadPasteCorpus(): PasteCorpusFixture[] {
  return PASTE_CORPUS_SOURCE_IDS.map(loadPasteCorpusFixture);
}
