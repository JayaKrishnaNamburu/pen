import type { AIToolDescriptor } from "@pen/ai-tools";
import type { AISkillDefinition } from "../types";

const DEFAULT_USAGE = [
  "Use this skill when you need to inspect or edit a Pen document through the native @pen/ai-tools surface.",
  "Start by listing tools, then execute only the tool calls that are necessary for the current task.",
].join("\n");

export function createDocumentAgentSkill(
  tools: readonly AIToolDescriptor[],
): AISkillDefinition {
  return {
    name: "pen-document-agent",
    title: "Pen Document Agent",
    description:
      "Use when an agent needs to inspect, rewrite, or structurally edit a Pen document through @pen/ai-tools.",
    tools,
    usage: DEFAULT_USAGE,
    instructions: [
      "Prefer read-focused tools before mutation tools so the agent builds enough context.",
      "Treat @pen/ai-tools as the source of truth; the skill only packages instructions and helper artifacts for agents.",
      "Return concise summaries of the mutations you apply and note any tools you used.",
    ],
    scripts: [
      {
        path: "scripts/print-tools.sh",
        content: [
          "#!/usr/bin/env bash",
          "set -euo pipefail",
          "echo \"Pen document agent tools:\"",
          ...tools.map((tool) => `echo \"- ${tool.name}: ${tool.description}\"`),
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

export function listDefaultAISkills(
  tools: readonly AIToolDescriptor[],
): readonly AISkillDefinition[] {
  return [createDocumentAgentSkill(tools)];
}
