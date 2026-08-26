import type { BlockA11ySpec, Editor } from "@input/pen-types";

import { A11Y_MISSING_LABEL_CODE } from "./resolveEditorA11yLabel";

export type SchemaA11yKind = "block" | "inline";

export type SchemaA11yAttrs = {
	label: string;
	roleDescription?: string;
};

const missingTypesByEditor = new WeakMap<Editor, Set<string>>();

export function resolveSchemaA11y(
	editor: Editor,
	target: {
		kind: SchemaA11yKind;
		type: string;
		props: Record<string, unknown>;
	},
): SchemaA11yAttrs {
	const schema =
		target.kind === "block"
			? editor.schema.resolve(target.type)
			: editor.schema.resolveInline(target.type);
	return resolveA11ySpec(schema?.a11y, target.type, target.props, editor);
}

export function resolveA11ySpec(
	spec: BlockA11ySpec | undefined,
	type: string,
	props: Record<string, unknown>,
	editor?: Editor,
): SchemaA11yAttrs {
	const raw = readA11yLabel(spec, props);
	if (raw.length > 0) {
		return spec?.roleDescription
			? { label: raw, roleDescription: spec.roleDescription }
			: { label: raw };
	}
	if (editor) {
		warnMissingSchemaA11y(editor, type);
	}
	return spec?.roleDescription
		? { label: type, roleDescription: spec.roleDescription }
		: { label: type };
}

function readA11yLabel(
	spec: BlockA11ySpec | undefined,
	props: Record<string, unknown>,
): string {
	if (!spec) {
		return "";
	}
	const value =
		typeof spec.label === "function" ? spec.label(props) : spec.label;
	return typeof value === "string" ? value.trim() : "";
}

function warnMissingSchemaA11y(editor: Editor, type: string): void {
	const seen = missingTypesByEditor.get(editor) ?? new Set<string>();
	if (seen.has(type)) {
		return;
	}
	seen.add(type);
	missingTypesByEditor.set(editor, seen);
	if (!editor.internals.hasListeners("diagnostic")) {
		return;
	}
	editor.internals.emit("diagnostic", {
		code: A11Y_MISSING_LABEL_CODE,
		level: "warn",
		source: "a11y",
		message: `schema type "${type}" is missing an a11y label`,
		remediation:
			"Add defineBlock(...).a11y({ label }) or InlineSchema.a11y.",
		type,
	});
}
