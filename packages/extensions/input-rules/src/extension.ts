import type { DocumentOp, Extension, OpOrigin } from "@input/pen-types";
import { INPUT_RULES_ENGINE_SLOT_KEY } from "@input/pen-types";
import { InputRuleEngine } from "./engine";
import { defaultBlockRules } from "./defaultRules";
import { defaultInlineRules } from "./inlineRules";
import type { InputRulesConfig } from "./types";

export const INPUT_RULES_EXTENSION_NAME = "input-rules";

const BYPASS_ORIGINS = new Set<OpOrigin>([
	"input-rule",
	"collaborator",
	"import",
	"history",
	"system",
]);

export function inputRulesExtension(config: InputRulesConfig = {}): Extension {
	const engine = new InputRuleEngine();

	if (!config.disableDefaults) {
		for (const rule of defaultBlockRules) {
			engine.register(rule);
		}
	}

	if (!config.disableDefaultInlineRules) {
		for (const rule of defaultInlineRules) {
			engine.registerInline(rule);
		}
	}

	if (config.rules) {
		for (const rule of config.rules) {
			engine.register(rule);
		}
	}

	if (config.inlineRules) {
		for (const rule of config.inlineRules) {
			engine.registerInline(rule);
		}
	}

	let unsub: (() => void) | null = null;
	const produced = new WeakSet<DocumentOp[]>();

	// Wave 1.3: Extension.inputRules → pen.inputRules via inputRulesToProviders.
	// This extension keeps engine registration; Wave 7 deletes the v1 field.
	return {
		name: INPUT_RULES_EXTENSION_NAME,
		version: "0.0.0",

		activateClient: async (ctx) => {
			const { editor } = ctx;

			unsub?.();
			unsub = editor.onBeforeApply(
				(ops, options) => {
					const origin = options.origin ?? "user";
					if (BYPASS_ORIGINS.has(origin)) return ops;
					if (produced.has(ops)) return ops;
					const next = appendInputRuleTransforms(editor, engine, ops);
					produced.add(next);
					return next;
				},
				{ priority: 300 },
			);

			ctx.editor.internals.assignSlot(INPUT_RULES_ENGINE_SLOT_KEY, engine);
		},

		deactivateClient: async () => {
			unsub?.();
			unsub = null;
		},
	};
}

function appendInputRuleTransforms(
	editor: Parameters<NonNullable<Extension["activateClient"]>>[0]["editor"],
	engine: InputRuleEngine,
	ops: DocumentOp[],
): DocumentOp[] {
	const transformedOps: DocumentOp[] = [];

	for (const op of ops) {
		transformedOps.push(op);

		if (
			op.type !== "splice-text" ||
			typeof op.insert !== "string" ||
			op.insert.length !== 1 ||
			op.from !== op.to
		) {
			continue;
		}

		const blockResult = engine.tryMatch(editor, op.blockId, op.insert, {
			offset: op.from,
		});
		if (blockResult) {
			transformedOps.push(...blockResult);
			continue;
		}

		const inlineResult = engine.tryMatchInline(editor, op.blockId, op.insert, {
			offset: op.from,
		});
		if (inlineResult) {
			transformedOps.push(...inlineResult);
		}
	}

	return transformedOps;
}
