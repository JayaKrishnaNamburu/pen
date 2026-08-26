import {
  PASTE_CORPUS_SYNTHETIC_PROVENANCE,
  PASTE_CORPUS_SYNTHETIC_SIZE_CEILING,
  type PasteCorpusCaptureProvenance,
  type PasteCorpusFixture,
  type PasteCorpusOutcomes,
  type PasteCorpusProvenance,
} from "./types";

const OUTCOME_KEYS: readonly (keyof PasteCorpusOutcomes)[] = [
  "headings",
  "lists",
  "tables",
  "code",
  "links",
  "images",
  "marks",
  "colors",
];

export function isSyntheticProvenance(
  provenance: PasteCorpusProvenance,
): provenance is typeof PASTE_CORPUS_SYNTHETIC_PROVENANCE {
  return provenance === PASTE_CORPUS_SYNTHETIC_PROVENANCE;
}

function isCapturedProvenance(
  provenance: PasteCorpusProvenance,
): provenance is PasteCorpusCaptureProvenance {
  return (
    typeof provenance === "object" &&
    provenance !== null &&
    provenance.kind === "captured"
  );
}

export function formatPasteCorpusProvenance(
  provenance: PasteCorpusProvenance,
): string {
  if (isSyntheticProvenance(provenance)) {
    return PASTE_CORPUS_SYNTHETIC_PROVENANCE;
  }
  if (isCapturedProvenance(provenance)) {
    return `captured: ${provenance.application} ${provenance.version} (${provenance.capturedAt})`;
  }
  const exhaustive: never = provenance;
  return exhaustive;
}

export function validatePasteCorpusFixture(fixture: PasteCorpusFixture): void {
  const { id, html, plain, expectation } = fixture;
  if (expectation.id !== id) {
    throw new Error(`paste corpus ${id}: expectation.id is ${expectation.id}`);
  }
  if (html.trim().length === 0) {
    throw new Error(`paste corpus ${id}: clipboard.html is empty`);
  }
  if (plain.trim().length === 0) {
    throw new Error(`paste corpus ${id}: plain.txt is empty`);
  }

  if (isSyntheticProvenance(expectation.provenance)) {
    if (html.length > PASTE_CORPUS_SYNTHETIC_SIZE_CEILING) {
      throw new Error(
        `paste corpus ${id}: synthetic clipboard.html is ${html.length} bytes; a real capture must set provenance.kind to "captured" (ceiling ${PASTE_CORPUS_SYNTHETIC_SIZE_CEILING})`,
      );
    }
    if (!expectation.approximates.trim()) {
      throw new Error(
        `paste corpus ${id}: synthetic fixture is missing approximates`,
      );
    }
  } else if (isCapturedProvenance(expectation.provenance)) {
    const capture = expectation.provenance;
    if (!capture.application.trim()) {
      throw new Error(
        `paste corpus ${id}: captured provenance is missing application`,
      );
    }
    if (!capture.version.trim()) {
      throw new Error(
        `paste corpus ${id}: captured provenance is missing version`,
      );
    }
    if (Number.isNaN(Date.parse(capture.capturedAt))) {
      throw new Error(`paste corpus ${id}: capturedAt is not an ISO date`);
    }
  } else {
    const exhaustive: never = expectation.provenance;
    throw new Error(`paste corpus ${id}: ${exhaustive}`);
  }

  for (const key of OUTCOME_KEYS) {
    const value = expectation.outcomes[key];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`paste corpus ${id}: outcomes.${key} is missing`);
    }
  }
  if (!Array.isArray(expectation.blocks) || expectation.blocks.length === 0) {
    throw new Error(
      `paste corpus ${id}: blocks is empty — record the stated structure`,
    );
  }
  if (!Array.isArray(expectation.intentionalLosses)) {
    throw new Error(`paste corpus ${id}: intentionalLosses must be an array`);
  }
}
