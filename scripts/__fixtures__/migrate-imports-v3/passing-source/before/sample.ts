import { suggestions } from "@input/pen-ai-suggestions";
import type { Autocomplete } from "@input/pen-ai-autocomplete";
import { skill } from "@input/pen-ai-skills";
import { tool } from "@input/pen-ai-tools";
import { stream } from "@input/pen-delta-stream";
import { htmlIn } from "@input/pen-import-html";
import { htmlOut } from "@input/pen-export-html";
import { jsonIn } from "@input/pen-import-json";
import { jsonOut } from "@input/pen-export-json";
import { mdIn } from "@input/pen-import-markdown";
import { mdOut } from "@input/pen-export-markdown";
import { xmlOut } from "@input/pen-export-xml";
import "@input/pen-ai-tools";
export { htmlIn } from "@input/pen-import-html";
export type { Autocomplete } from "@input/pen-ai-autocomplete";
export * from "@input/pen-export-html";

export async function load() {
	const mod = await import("@input/pen-ai-skills");
	return require("@input/pen-delta-stream") ?? mod;
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
