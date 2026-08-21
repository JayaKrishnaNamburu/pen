import type { OpOrigin } from "@input/pen-types";

export function getOpOriginType(origin: OpOrigin): string {
	return typeof origin === "string" ? origin : origin.type;
}
