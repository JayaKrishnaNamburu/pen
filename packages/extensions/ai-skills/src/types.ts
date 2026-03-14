import type { AIToolDescriptor } from "@pen/ai-tools";

export interface AISkillScript {
  path: string;
  content: string;
}

export interface AISkillFile {
  path: string;
  content: string;
}

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
