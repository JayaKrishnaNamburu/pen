import { suggestions } from "@input/pen-ai/suggestions";
import type { Autocomplete } from "@input/pen-ai/autocomplete";
import { skill } from "@input/pen-ai/skills";
import { tool } from "@input/pen-ai/tools";
import { stream } from "@input/pen-ai/stream";
import { htmlIn } from "@input/pen-interop/html";
import { htmlOut } from "@input/pen-interop/html";
import { jsonIn } from "@input/pen-interop/json";
import { jsonOut } from "@input/pen-interop/json";
import { mdIn } from "@input/pen-interop/markdown";
import { mdOut } from "@input/pen-interop/markdown";
import { xmlOut } from "@input/pen-interop/xml";
import "@input/pen-ai/tools";
export { htmlIn } from "@input/pen-interop/html";
export type { Autocomplete } from "@input/pen-ai/autocomplete";
export * from "@input/pen-interop/html";

export async function load() {
	const mod = await import("@input/pen-ai/skills");
	return require("@input/pen-ai/stream") ?? mod;
}

export const leftover = {
	suggestions,
	skill,
	tool,
	stream,
	htmlOut,
	jsonIn,
	jsonOut,
	mdIn,
	mdOut,
	xmlOut,
};
