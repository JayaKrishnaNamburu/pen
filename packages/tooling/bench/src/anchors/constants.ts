export const PG1_RULE_ID = "PG1";
export const PG1_SPEC = "spec/rules/anchors.md";
export const PG1_SCHEMA_VERSION = 1;
export const PG1_BASELINE_FILENAME = "v3-anchor-budget.chromium.json";

/** 10k-word fixture identity (`src/tenKWordFixture.ts`, seed `0x70656e33`). */
export const PG1_TEN_K_SEED = 0x70656e33;
export const PG1_TEN_K_SEED_HEX = "0x70656e33";
export const PG1_TEN_K_FIXTURE_ID = "ten-k-words";
export const PG1_TEN_K_GENERATOR =
	"packages/tooling/conformance/src/tenKWordFixture.ts";
export const PG1_TEN_K_WORD_COUNT = 10_200;
export const PG1_TEN_K_PARAGRAPH_COUNT = 20;
export const PG1_TEN_K_CELL_COUNT = 4;
export const PG1_TEN_K_CELL_WORD_COUNT = 200;
export const PG1_TEN_K_PARAGRAPH_SHA256 =
	"5fea352d718dc4a3674716a062db62d0e71041c78fb44a58497853e45232e400";
export const PG1_TEN_K_CONTENT_SHA256 =
	"def214258d042eec4bc7a3ca3b7d096ff8c505f8b309ebddd098578cf5f1ccee";

/**
 * Spec clocks from `01-anchors.md` §3. Machine-dependent (CH8).
 * Recorded with `enforced: false`. The gate is the counts.
 */
export const PG1_MINT_P95_US = 5;
export const PG1_RESOLVE_COLD_P95_MS = 1;
export const PG1_RESOLVE_CACHED_P95_US = 50;
export const PG1_REPAIR_P95_MS = 0.5;
export const PG1_PHASE6_DELTA_P95_MS = 0.1;

/** clientID 0 only. A live Y.Doc client id encodes larger. */
export const PG1_CLIENT_ID = 0;
export const PG1_ENCODE_MIN_BYTES = 4;
export const PG1_ENCODE_P50_BYTES = 6;
export const PG1_ENCODE_P95_BYTES = 6;
export const PG1_ENCODE_MAX_BYTES = 6;
export const PG1_ENCODE_CAP_BYTES = 256;

export const PG1_MISSING = "PG1_BASELINE_MISSING";
export const PG1_SCHEMA = "PG1_SCHEMA";
export const PG1_FIXTURE_SEED = "PG1_FIXTURE_SEED";
export const PG1_FIXTURE_HASH = "PG1_FIXTURE_HASH";
export const PG1_POPULATION = "PG1_POPULATION";
