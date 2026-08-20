import type { AIToolDescriptor } from "@input/pen-ai-tools";
import type { AutocompleteProviderDescriptor } from "@input/pen-ai-autocomplete";
import type { AISkillDefinition } from "../types";

const DEFAULT_USAGE = [
	"Use this skill when you need to inspect or edit a Pen document through the native @input/pen-ai-tools surface.",
	"Start by listing tools, then execute only the tool calls that are necessary for the current task.",
].join("\n");

/**
 * Builds the bundled document-agent skill from tool descriptors.
 *
 * @remarks Instruction strings are English packaging copy, not a localization catalog.
 */
export function createDocumentAgentSkill(
	tools: readonly AIToolDescriptor[],
): AISkillDefinition {
	return {
		name: "pen-document-agent",
		title: "Pen Document Agent",
		description:
			"Use when an agent needs to inspect, rewrite, or structurally edit a Pen document through @input/pen-ai-tools.",
		tools,
		usage: DEFAULT_USAGE,
		instructions: [
			"Prefer read-focused tools before mutation tools so the agent builds enough context.",
			"Treat @input/pen-ai-tools as the source of truth; the skill only packages instructions and helper artifacts for agents.",
			"Return concise summaries of the mutations you apply and note any tools you used.",
		],
		scripts: [
			{
				path: "scripts/print-tools.sh",
				content: [
					"#!/usr/bin/env bash",
					"set -euo pipefail",
					'echo "Pen document agent tools:"',
					...tools.map(
						(tool) => `echo "- ${tool.name}: ${tool.description}"`,
					),
				].join("\n"),
			},
		],
		references: [
			{
				path: "references/tools.json",
				content: JSON.stringify({ tools }, null, 2),
			},
		],
	};
}

/**
 * Builds the bundled autocomplete-context skill from provider descriptors.
 *
 * @remarks Instruction strings are English packaging copy, not a localization catalog.
 */
export function createAutocompleteProviderSkill(
	providers: readonly AutocompleteProviderDescriptor[],
): AISkillDefinition {
	return {
		name: "pen-autocomplete-context",
		title: "Pen Autocomplete Context",
		description:
			"Use when an agent needs to understand or document the runtime autocomplete context that Pen injects through @input/pen-ai-autocomplete providers.",
		tools: [],
		usage: [
			"Use this skill when you need to inspect which runtime context providers participate in Pen autocomplete prompts.",
			"Treat these descriptors as packaging and documentation artifacts; they do not execute in the hot path.",
		].join("\n"),
		instructions: [
			"Read provider descriptors before proposing autocomplete prompt changes so you understand the existing context surface.",
			"Keep runtime autocomplete context bounded, read-only, and cheap; provider descriptors document that boundary for agents.",
			"When suggesting new providers, explain why they belong on the autocomplete hot path and what their latency or size budget should be.",
		],
		references: [
			{
				path: "references/providers.json",
				content: JSON.stringify({ providers }, null, 2),
			},
		],
	};
}

/**
 * Builds the bundled skills a host typically ships: the document-agent skill,
 * plus an autocomplete-context skill when provider descriptors are supplied.
 *
 * @remarks Pen does not load or execute the returned skills. The host renders
 * and serves them. Empty `autocompleteProviders` omits that skill.
 */
export function listDefaultAISkills(
	tools: readonly AIToolDescriptor[],
	options: {
		autocompleteProviders?: readonly AutocompleteProviderDescriptor[];
	} = {},
): readonly AISkillDefinition[] {
	const skills: AISkillDefinition[] = [createDocumentAgentSkill(tools)];
	if ((options.autocompleteProviders?.length ?? 0) > 0) {
		skills.push(
			createAutocompleteProviderSkill(
				options.autocompleteProviders ?? [],
			),
		);
	}
	return skills;
}
