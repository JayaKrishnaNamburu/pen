import type { AISkillDefinition } from "../types";

export class AISkillRegistry {
  private readonly skills = new Map<string, AISkillDefinition>();

  register(skill: AISkillDefinition): void {
    this.skills.set(skill.name, skill);
  }

  list(): readonly AISkillDefinition[] {
    return [...this.skills.values()];
  }

  get(name: string): AISkillDefinition | null {
    return this.skills.get(name) ?? null;
  }
}
