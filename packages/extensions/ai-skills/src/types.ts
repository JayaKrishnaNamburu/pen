import type { AIToolDescriptor } from "@input/pen-ai-tools";

/**
 * Helper script bundled next to a skill's `SKILL.md`.
 *
 * @remarks Pen never executes these scripts. The host writes them if it wants them on disk.
 */
export interface AISkillScript {
	path: string;
	content: string;
}

/**
 * File rendered into a skill bundle (`SKILL.md`, a script, or a JSON reference).
 *
 * @remarks Pen never writes this file. The host persists or serves it.
 */
export interface AISkillFile {
	path: string;
	content: string;
}

/**
 * Host-facing skill artifact definition.
 *
 * @remarks This is packaging copy for an external agent, not a Pen runtime object.
 * Default bundled skills ship English instruction strings; hosts that need another
 * language author their own definition. Pen does not load, localize, or execute skills.
 */
export interface AISkillDefinition {
	name: string;
	title: string;
	description: string;
	tools: readonly AIToolDescriptor[];
	usage: string;
	instructions: readonly string[];
	scripts?: readonly AISkillScript[];
	references?: readonly AISkillFile[];
}
