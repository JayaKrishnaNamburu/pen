/**
 * Named commit-pipeline phases from spec-v2/06-commit-pipeline.md.
 * Step 2.1 makes the boundaries visible; step 2.2 replaces phase 8's
 * v1 `change` / `documentCommit` emit with `CommitEvent`.
 */

export const PIPELINE_PHASES = [
	"hooks",
	"validate",
	"execute",
	"normalize",
	"summarize",
	"map-selection",
	"settle-facets",
	"emit",
] as const;

export type PipelinePhase = (typeof PIPELINE_PHASES)[number];

/** Nested applies beyond this queue depth in one task turn trip `apply-storm` (I7). */
export const APPLY_STORM_QUEUE_LIMIT = 16;

export const APPLY_STORM_CODE = "apply-storm";
