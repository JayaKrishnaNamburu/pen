export const PASTE_CORPUS_PROVENANCE = "synthetic-until-capture" as const;

export const PASTE_CORPUS_SOURCE_IDS = [
  "word-desktop",
  "word-web",
  "google-docs",
  "apple-notes",
  "notion",
  "vscode",
  "article",
  "excel-sheets",
  "pen",
] as const;

export type PasteCorpusSourceId = (typeof PASTE_CORPUS_SOURCE_IDS)[number];

export type PasteCorpusMarkExpectation = {
  type: string;
  text: string;
};

export type PasteCorpusBlockExpectation = {
  type: string;
  text?: string;
  level?: number;
  indent?: number;
  language?: string;
  checked?: boolean;
  rows?: number;
  cols?: number;
  hasHeaderRow?: boolean;
  cells?: string[][];
  marks?: PasteCorpusMarkExpectation[];
};

export type PasteCorpusOutcomes = {
  headings: string;
  lists: string;
  tables: string;
  code: string;
  links: string;
  images: string;
  marks: string;
  colors: string;
};

export type PasteCorpusExpectation = {
  id: PasteCorpusSourceId;
  source: string;
  provenance: typeof PASTE_CORPUS_PROVENANCE;
  approximates: string;
  markers: string[];
  imageCount: number;
  outcomes: PasteCorpusOutcomes;
  intentionalLosses: string[];
  blocks: PasteCorpusBlockExpectation[];
};

export type PasteCorpusFixture = {
  id: PasteCorpusSourceId;
  html: string;
  plain: string;
  expectation: PasteCorpusExpectation;
};
