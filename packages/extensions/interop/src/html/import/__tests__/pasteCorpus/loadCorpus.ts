import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PASTE_CORPUS_SOURCE_IDS,
  type PasteCorpusExpectation,
  type PasteCorpusFixture,
  type PasteCorpusSourceId,
} from "./types";
import { validatePasteCorpusFixture } from "./validate";

// Own directory: the paste-corpus fixtures moved with this file.
// Depth difference: 0. Still resolves to __tests__/pasteCorpus/.
const corpusDir = dirname(fileURLToPath(import.meta.url));

export function loadPasteCorpusFixture(
  id: PasteCorpusSourceId,
): PasteCorpusFixture {
  const dir = join(corpusDir, id);
  const fixture: PasteCorpusFixture = {
    id,
    html: readFileSync(join(dir, "clipboard.html"), "utf8"),
    plain: readFileSync(join(dir, "plain.txt"), "utf8"),
    expectation: JSON.parse(
      readFileSync(join(dir, "expectation.json"), "utf8"),
    ) as PasteCorpusExpectation,
  };
  validatePasteCorpusFixture(fixture);
  return fixture;
}

export function loadPasteCorpus(): PasteCorpusFixture[] {
  return PASTE_CORPUS_SOURCE_IDS.map(loadPasteCorpusFixture);
}
