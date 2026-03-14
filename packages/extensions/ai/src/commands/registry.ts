import type { AICommandBinding, AICommandContext } from "../types";

export class AICommandRegistry {
	private _commands: AICommandBinding[] = [];

	register(command: AICommandBinding): void {
		const existing = this._commands.findIndex((item) => item.id === command.id);
		if (existing >= 0) {
			this._commands[existing] = command;
			return;
		}
		this._commands.push(command);
	}

	unregister(id: string): void {
		this._commands = this._commands.filter((item) => item.id !== id);
	}

	list(ctx?: AICommandContext): readonly AICommandBinding[] {
		if (!ctx) return this._commands;
		return this._commands.filter((item) => !item.guard || item.guard(ctx));
	}

	resolve(id: string): AICommandBinding | null {
		return this._commands.find((item) => item.id === id) ?? null;
	}

	resolvePrompt(command: AICommandBinding, ctx: AICommandContext): string {
		return typeof command.prompt === "function"
			? command.prompt(ctx)
			: command.prompt;
	}
}
