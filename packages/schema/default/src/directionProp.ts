import { prop, resolveSchema } from "@input/pen-types";

/** optional writing direction; no default so unset stays unset (first-strong can run) */
export const directionProp = resolveSchema(
  prop
    .enum(["ltr", "rtl", "auto"])
    .optional()
    .default(undefined)
    .describe("Block writing direction"),
);
